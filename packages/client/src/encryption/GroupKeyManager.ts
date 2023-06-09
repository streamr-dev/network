import { StreamID, StreamPartID, StreamPartIDUtils } from '@streamr/protocol'
import { EthereumAddress, waitForEvent } from '@streamr/utils'
import crypto from 'crypto'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { DestroySignal } from '../DestroySignal'
import { StreamrClientEventEmitter } from '../events'
import { uuid } from '../utils/uuid'
import { GroupKey } from './GroupKey'
import { LitProtocolFacade } from './LitProtocolFacade'
import { LocalGroupKeyStore } from './LocalGroupKeyStore'
import { SubscriberKeyExchange } from './SubscriberKeyExchange'

@scoped(Lifecycle.ContainerScoped)
export class GroupKeyManager {

    private readonly localGroupKeyStore: LocalGroupKeyStore
    private readonly litProtocolFacade: LitProtocolFacade
    private readonly subscriberKeyExchange: SubscriberKeyExchange
    private readonly eventEmitter: StreamrClientEventEmitter
    private readonly destroySignal: DestroySignal
    private readonly authentication: Authentication
    private readonly config: Pick<StrictStreamrClientConfig, 'encryption'>

    constructor(
        localGroupKeyStore: LocalGroupKeyStore,
        litProtocolFacade: LitProtocolFacade,
        subscriberKeyExchange: SubscriberKeyExchange,
        eventEmitter: StreamrClientEventEmitter,
        destroySignal: DestroySignal,
        @inject(AuthenticationInjectionToken) authentication: Authentication,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'encryption'>
    ) {
        this.localGroupKeyStore = localGroupKeyStore
        this.litProtocolFacade = litProtocolFacade
        this.subscriberKeyExchange = subscriberKeyExchange
        this.eventEmitter = eventEmitter
        this.destroySignal = destroySignal
        this.authentication = authentication
        this.config = config
    }

    async fetchKey(streamPartId: StreamPartID, groupKeyId: string, publisherId: EthereumAddress): Promise<GroupKey> {
        const streamId = StreamPartIDUtils.getStreamID(streamPartId)

        // 1st try: local storage
        let groupKey = await this.localGroupKeyStore.get(groupKeyId, publisherId)
        if (groupKey !== undefined) {
            return groupKey
        }

        // 2nd try: lit-protocol
        if (this.config.encryption.litProtocolEnabled) {
            groupKey = await this.litProtocolFacade.get(streamId, groupKeyId)
            if (groupKey !== undefined) {
                await this.localGroupKeyStore.set(groupKey.id, publisherId, groupKey.data)
                return groupKey
            }
        }

        // 3rd try: Streamr key-exchange
        await this.subscriberKeyExchange.requestGroupKey(groupKeyId, publisherId, streamPartId)
        const groupKeyIds = await waitForEvent(
            // TODO remove "as any" type casing in NET-889
            this.eventEmitter as any,
            'storeEncryptionKeyToLocalStore',
            this.config.encryption.keyRequestTimeout,
            (storedGroupKeyId: string) => storedGroupKeyId === groupKeyId,
            this.destroySignal.abortSignal
        )
        groupKey = await this.localGroupKeyStore.get(groupKeyIds[0] as string, publisherId)
        return groupKey!
    }

    async fetchLatestEncryptionKey(publisherId: EthereumAddress, streamId: StreamID): Promise<GroupKey | undefined> {
        if (publisherId !== (await this.authentication.getAddress())) {
            throw new Error('storeKey: fetching latest encryption keys for other publishers not supported.')
        }
        const keyId = await this.localGroupKeyStore.getLatestEncryptionKeyId(publisherId, streamId)
        return keyId !== undefined ? this.localGroupKeyStore.get(keyId, publisherId) : undefined
    }

    async storeKey(groupKey: GroupKey | undefined, publisherId: EthereumAddress, streamId: StreamID): Promise<GroupKey> {
        if (publisherId !== (await this.authentication.getAddress())) { // TODO: unit test?
            throw new Error('storeKey: storing latest encryption keys for other publishers not supported.')
        }
        if (groupKey === undefined) {
            const keyData = crypto.randomBytes(32)
            // 1st try lit-protocol, if a key cannot be generated and stored, then generate group key locally
            if (this.config.encryption.litProtocolEnabled) {
                groupKey = await this.litProtocolFacade.store(streamId, keyData)
            }
            if (groupKey === undefined) {
                groupKey = new GroupKey(uuid('GroupKey'), keyData)
            }
        }
        await this.localGroupKeyStore.set(groupKey.id, publisherId, groupKey.data)
        await this.localGroupKeyStore.setLatestEncryptionKeyId(groupKey.id, publisherId, streamId)
        return groupKey
    }

    addKeyToLocalStore(groupKey: GroupKey, publisherId: EthereumAddress): Promise<void> {
        return this.localGroupKeyStore.set(groupKey.id, publisherId, groupKey.data)
    }
}
