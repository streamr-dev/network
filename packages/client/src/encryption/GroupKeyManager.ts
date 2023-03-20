import { LitProtocolFacade } from './LitProtocolFacade'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { GroupKeyStore } from './GroupKeyStore'
import { GroupKey } from './GroupKey'
import { StreamID, StreamPartID, StreamPartIDUtils } from '@streamr/protocol'
import { EthereumAddress, waitForEvent } from '@streamr/utils'
import { SubscriberKeyExchange } from './SubscriberKeyExchange'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { StreamrClientEventEmitter } from '../events'
import { DestroySignal } from '../DestroySignal'
import crypto from 'crypto'
import { uuid } from '../utils/uuid'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'

@scoped(Lifecycle.ContainerScoped)
export class GroupKeyManager {
    private readonly groupKeyStore: GroupKeyStore
    private readonly litProtocolFacade: LitProtocolFacade
    private readonly subscriberKeyExchange: SubscriberKeyExchange
    private readonly eventEmitter: StreamrClientEventEmitter
    private readonly destroySignal: DestroySignal
    private readonly authentication: Authentication
    private readonly config: Pick<StrictStreamrClientConfig, 'encryption'>

    constructor(
        groupKeyStore: GroupKeyStore,
        litProtocolFacade: LitProtocolFacade,
        subscriberKeyExchange: SubscriberKeyExchange,
        eventEmitter: StreamrClientEventEmitter,
        destroySignal: DestroySignal,
        @inject(AuthenticationInjectionToken) authentication: Authentication,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'encryption'>
    ) {
        this.groupKeyStore = groupKeyStore
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
        let groupKey = await this.groupKeyStore.get(groupKeyId, publisherId)
        if (groupKey !== undefined) {
            return groupKey
        }

        // 2nd try: lit-protocol
        if (this.config.encryption.litProtocolEnabled) {
            groupKey = await this.litProtocolFacade.get(streamId, groupKeyId)
            if (groupKey !== undefined) {
                await this.groupKeyStore.add(groupKey, publisherId)
                return groupKey
            }
        }

        // 3rd try: Streamr key-exchange
        await this.subscriberKeyExchange.requestGroupKey(groupKeyId, publisherId, streamPartId)
        const groupKeys = await waitForEvent(
            // TODO remove "as any" type casing in NET-889
            this.eventEmitter as any,
            'addGroupKey',
            this.config.encryption.keyRequestTimeout,
            (storedGroupKey: GroupKey) => storedGroupKey.id === groupKeyId,
            this.destroySignal.abortSignal
        )
        return groupKeys[0] as GroupKey
    }

    // TODO: unit test?
    async fetchLatestPublisherKey(streamId: StreamID, publisherId: EthereumAddress): Promise<GroupKey | undefined> {
        if (publisherId !== (await this.authentication.getAddress())) {
            throw new Error('storeKey: fetching latest publisher keys for other publishers not supported.')
        }
        const keyId = await this.groupKeyStore.getPublisherKeyId(publisherId, streamId)
        return keyId !== undefined ? this.groupKeyStore.get(keyId, publisherId) : undefined
    }

    async storeKey(groupKey: GroupKey | undefined, publisherId: EthereumAddress, streamId: StreamID): Promise<GroupKey> { // TODO: name
        if (publisherId !== (await this.authentication.getAddress())) { // TODO: unit test?
            throw new Error('storeKey: storing keys for other publishers not supported.')
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
        await this.groupKeyStore.add(groupKey, publisherId)
        await this.groupKeyStore.addPublisherKeyId(groupKey.id, publisherId, streamId)
        return groupKey
    }

    addKeyToLocalStore(groupKey: GroupKey, publisherId: EthereumAddress): Promise<void> {
        return this.groupKeyStore.add(groupKey, publisherId)
    }
}
