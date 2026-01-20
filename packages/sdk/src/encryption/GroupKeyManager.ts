import { hexToBinary, StreamID, StreamPartID, StreamPartIDUtils, UserID, waitForEvent } from '@streamr/utils'
import crypto from 'crypto'
import { Lifecycle, inject, scoped } from 'tsyringe'
import { Identity, IdentityInjectionToken } from '../identity/Identity'
import { ConfigInjectionToken, type StrictStreamrClientConfig } from '../ConfigTypes'
import { DestroySignal } from '../DestroySignal'
import { StreamrClientEventEmitter } from '../events'
import { uuid } from '../utils/uuid'
import { GroupKey } from './GroupKey'
import { LocalGroupKeyStore } from './LocalGroupKeyStore'
import { SubscriberKeyExchange } from './SubscriberKeyExchange'
import { StreamIDBuilder } from '../StreamIDBuilder'
import { createLazyMap, Mapping } from '../utils/Mapping'
import { StreamrClientError } from '../StreamrClientError'

/**
 * Gets an explicit encryption key from config for a given stream.
 * Returns undefined if no key is configured for the stream.
 */
export const getExplicitKey = async (
    streamId: StreamID,
    streamIdBuilder: StreamIDBuilder,
    config: StrictStreamrClientConfig['encryption']
): Promise<GroupKey | undefined> => {
    if (config.keys !== undefined) {
        for (const entry of Object.entries(config.keys)) {
            if (await streamIdBuilder.toStreamID(entry[0]) === streamId) {
                return new GroupKey(entry[1].id, Buffer.from(hexToBinary(entry[1].data)))
            }
        }
    }
    return undefined
}

@scoped(Lifecycle.ContainerScoped)
export class GroupKeyManager {

    private readonly subscriberKeyExchange: SubscriberKeyExchange
    private readonly localGroupKeyStore: LocalGroupKeyStore
    private readonly explicitKeys?: Mapping<StreamID, GroupKey | undefined>
    private readonly config: Pick<StrictStreamrClientConfig, 'encryption'>
    private readonly identity: Identity
    private readonly eventEmitter: StreamrClientEventEmitter
    private readonly destroySignal: DestroySignal

    constructor(
        subscriberKeyExchange: SubscriberKeyExchange,
        localGroupKeyStore: LocalGroupKeyStore,
        streamIdBuilder: StreamIDBuilder,
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
        if (config.encryption.keys !== undefined) {
            this.explicitKeys = createLazyMap({
                valueFactory: async (streamId: StreamID) => {
                    return getExplicitKey(streamId, streamIdBuilder, config.encryption)
                }
            })
        }
    }

    async fetchKey(streamPartId: StreamPartID, groupKeyId: string, publisherId: UserID): Promise<GroupKey> {
        // If explicit keys are defined only those keys are used.
        if (this.explicitKeys !== undefined) {
            const explicitKey = await this.explicitKeys.get(StreamPartIDUtils.getStreamID(streamPartId))
            if (explicitKey !== undefined) {
                return explicitKey
            }
            throw new StreamrClientError(
                `No encryption key available for stream part ID: groupKeyId=${groupKeyId}, streamPartId=${streamPartId}`,
                'UNEXPECTED_INPUT'
            )
        }

        // 2nd try: local storage
        let groupKey = await this.localGroupKeyStore.get(groupKeyId, publisherId)
        if (groupKey !== undefined) {
            return groupKey
        }

        // 3rd try: Streamr key-exchange
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
