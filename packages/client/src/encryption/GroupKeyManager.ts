import { LitProtocolKeyStore } from './LitProtocolKeyStore'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { GroupKeyStore } from './GroupKeyStore'
import { GroupKey } from './GroupKey'
import { StreamPartID, StreamPartIDUtils } from '@streamr/protocol'
import { EthereumAddress, waitForEvent } from '@streamr/utils'
import { SubscriberKeyExchange } from './SubscriberKeyExchange'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { StreamrClientEventEmitter } from '../events'
import { DestroySignal } from '../DestroySignal'

@scoped(Lifecycle.ContainerScoped)
export class GroupKeyManager {
    constructor(
        @inject(GroupKeyStore) private readonly groupKeyStore: GroupKeyStore,
        @inject(LitProtocolKeyStore) private readonly litProtocolKeyStore: LitProtocolKeyStore,
        @inject(SubscriberKeyExchange) private readonly subscriberKeyExchange: SubscriberKeyExchange,
        @inject(StreamrClientEventEmitter) private readonly eventEmitter: StreamrClientEventEmitter,
        @inject(DestroySignal) private readonly destroySignal: DestroySignal,
        @inject(ConfigInjectionToken) private readonly config: Pick<StrictStreamrClientConfig, 'decryption'>
    ) {
    }

    async fetchKey(streamPartId: StreamPartID, groupKeyId: string, publisherId: EthereumAddress): Promise<GroupKey> {
        const streamId = StreamPartIDUtils.getStreamID(streamPartId)

        // 1st try: local storage
        let groupKey = await this.groupKeyStore.get(groupKeyId, streamId)
        if (groupKey !== undefined) {
            return groupKey
        }

        // 2nd try: lit-protocol
        groupKey = await this.litProtocolKeyStore.get(streamId, groupKeyId)
        if (groupKey !== undefined) {
            await this.groupKeyStore.add(groupKey, streamId) // TODO: move to LitProtocolKeyStore
            return groupKey
        }

        // 3rd try: Streamr key-exchange
        await this.subscriberKeyExchange.requestGroupKey(groupKeyId, publisherId, streamPartId)
        const groupKeys = await waitForEvent(
            // TODO remove "as any" type casing in NET-889
            this.eventEmitter as any,
            'addGroupKey',
            this.config.decryption.keyRequestTimeout,
            (storedGroupKey: GroupKey) => storedGroupKey.id === groupKeyId,
            this.destroySignal.abortSignal)
        return groupKeys[0] as GroupKey
    }
}
