import { LitProtocolFacade } from './LitProtocolFacade'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { GroupKeyStore } from './GroupKeyStore'
import { GroupKey } from './GroupKey'
import { StreamID, StreamPartID, StreamPartIDUtils } from '@streamr/protocol'
import { EthereumAddress, Logger, waitForEvent } from '@streamr/utils'
import { SubscriberKeyExchange } from './SubscriberKeyExchange'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { StreamrClientEventEmitter } from '../events'
import { DestroySignal } from '../DestroySignal'
import crypto from 'crypto'
import { uuid } from '../utils/uuid'
import { LoggerFactory } from '../utils/LoggerFactory'

@scoped(Lifecycle.ContainerScoped)
export class GroupKeyManager {
    constructor(
        @inject(GroupKeyStore) private readonly groupKeyStore: GroupKeyStore,
        @inject(LitProtocolFacade) private readonly litProtocolFacade: LitProtocolFacade,
        @inject(SubscriberKeyExchange) private readonly subscriberKeyExchange: SubscriberKeyExchange,
        @inject(StreamrClientEventEmitter) private readonly eventEmitter: StreamrClientEventEmitter,
        @inject(DestroySignal) private readonly destroySignal: DestroySignal,
        @inject(ConfigInjectionToken) private readonly config: Pick<StrictStreamrClientConfig, 'decryption' | 'encryption'>
    ) {}

    async fetchKey(streamPartId: StreamPartID, groupKeyId: string, publisherId: EthereumAddress): Promise<GroupKey> {
        const streamId = StreamPartIDUtils.getStreamID(streamPartId)

        // 1st try: local storage
        let groupKey = await this.groupKeyStore.get(groupKeyId, streamId)
        if (groupKey !== undefined) {
            return groupKey
        }

        // 2nd try: lit-protocol
        if (this.config.encryption.litProtocolEnabled) {
            groupKey = await this.litProtocolFacade.get(streamId, groupKeyId)
            if (groupKey !== undefined) {
                await this.groupKeyStore.add(groupKey, streamId)
                return groupKey
            }
        }

        // 3rd try: Streamr key-exchange
        await this.subscriberKeyExchange.requestGroupKey(groupKeyId, publisherId, streamPartId)
        const groupKeys = await waitForEvent(
            // TODO remove "as any" type casing in NET-889
            this.eventEmitter as any,
            'addGroupKey',
            this.config.decryption.keyRequestTimeout,
            (storedGroupKey: GroupKey) => storedGroupKey.id === groupKeyId,
            this.destroySignal.abortSignal
        )
        return groupKeys[0] as GroupKey
    }

    async storeKey(groupKey: GroupKey | undefined, streamId: StreamID): Promise<GroupKey> { // TODO: name
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
        await this.groupKeyStore.add(groupKey, streamId)
        return groupKey
    }
}
