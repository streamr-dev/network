import { StreamID, StreamPartID, UserID, waitForEvent } from '@streamr/utils'
import crypto from 'crypto'
import { Lifecycle, inject, scoped } from 'tsyringe'
import { Identity, IdentityInjectionToken } from '../identity/Identity'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { DestroySignal } from '../DestroySignal'
import { StreamrClientEventEmitter } from '../events'
import { uuid } from '../utils/uuid'
import { GroupKey } from './GroupKey'
import { LocalGroupKeyStore } from './LocalGroupKeyStore'
import { SubscriberKeyExchange } from './SubscriberKeyExchange'

@scoped(Lifecycle.ContainerScoped)
export class GroupKeyManager {

    private readonly subscriberKeyExchange: SubscriberKeyExchange
    private readonly localGroupKeyStore: LocalGroupKeyStore
    private readonly config: Pick<StrictStreamrClientConfig, 'encryption'>
    private readonly identity: Identity
    private readonly eventEmitter: StreamrClientEventEmitter
    private readonly destroySignal: DestroySignal

    constructor(
        subscriberKeyExchange: SubscriberKeyExchange,
        localGroupKeyStore: LocalGroupKeyStore,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'encryption'>,
        @inject(IdentityInjectionToken) identity: Identity,
        eventEmitter: StreamrClientEventEmitter,
        destroySignal: DestroySignal
    ) {
        this.subscriberKeyExchange = subscriberKeyExchange
        this.localGroupKeyStore = localGroupKeyStore
        this.config = config
        this.identity = identity
        this.eventEmitter = eventEmitter
        this.destroySignal = destroySignal
    }

    async fetchKey(streamPartId: StreamPartID, groupKeyId: string, publisherId: UserID): Promise<GroupKey> {
        // 1st try: local storage
        let groupKey = await this.localGroupKeyStore.get(groupKeyId, publisherId)
        if (groupKey !== undefined) {
            return groupKey
        }

        // 2nd try: Streamr key-exchange
        await this.subscriberKeyExchange.requestGroupKey(groupKeyId, publisherId, streamPartId)
        const groupKeyIds = await waitForEvent(
            // TODO remove "as any" type casing in NET-889
            this.eventEmitter as any,
            'encryptionKeyStoredToLocalStore',
            this.config.encryption.keyRequestTimeout,
            (storedGroupKeyId: string) => storedGroupKeyId === groupKeyId,
            this.destroySignal.abortSignal
        )
        groupKey = await this.localGroupKeyStore.get(groupKeyIds[0] as string, publisherId)
        return groupKey!
    }

    async fetchLatestEncryptionKey(publisherId: UserID, streamId: StreamID): Promise<GroupKey | undefined> {
        if (publisherId !== (await this.identity.getUserId())) {
            throw new Error('storeKey: fetching latest encryption keys for other publishers not supported.')
        }
        const keyId = await this.localGroupKeyStore.getLatestEncryptionKeyId(publisherId, streamId)
        return keyId !== undefined ? this.localGroupKeyStore.get(keyId, publisherId) : undefined
    }

    async storeKey(groupKey: GroupKey | undefined, publisherId: UserID, streamId: StreamID): Promise<GroupKey> {
        if (publisherId !== (await this.identity.getUserId())) { // TODO: unit test?
            throw new Error('storeKey: storing latest encryption keys for other publishers not supported.')
        }
        if (groupKey === undefined) {
            const keyData = crypto.randomBytes(32)
            groupKey = new GroupKey(uuid('GroupKey'), keyData)
        }
        await this.localGroupKeyStore.set(groupKey.id, publisherId, groupKey.data)
        await this.localGroupKeyStore.setLatestEncryptionKeyId(groupKey.id, publisherId, streamId)
        return groupKey
    }

    addKeyToLocalStore(groupKey: GroupKey, publisherId: UserID): Promise<void> {
        return this.localGroupKeyStore.set(groupKey.id, publisherId, groupKey.data)
    }
}
