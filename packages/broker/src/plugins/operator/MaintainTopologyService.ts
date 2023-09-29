import { Logger } from '@streamr/utils'
import { StreamrClient, Subscription } from 'streamr-client'
import { StreamPartID, StreamPartIDUtils } from '@streamr/protocol'
import pLimit from 'p-limit'
import { StreamAssignmentLoadBalancer } from './StreamAssignmentLoadBalancer'

const logger = new Logger(module)

export class MaintainTopologyService {
    private readonly streamrClient: StreamrClient
    private readonly subscriptions = new Map<StreamPartID, Subscription>()
    private readonly concurrencyLimit = pLimit(1)

    constructor(streamrClient: StreamrClient, loadBalancer: StreamAssignmentLoadBalancer) {
        this.streamrClient = streamrClient
        loadBalancer.on('assigned', this.onAddStakedStreamPart)
        loadBalancer.on('unassigned', this.onRemoveStakedStreamPart)
    }

    private onAddStakedStreamPart = this.concurrencyLimiter(async (streamPartId: StreamPartID): Promise<void> => {
        const [id, partition] = StreamPartIDUtils.getStreamIDAndPartition(streamPartId)
        let subscription: Subscription
        try {
            subscription = await this.streamrClient.subscribe({
                id,
                partition,
                raw: true
            })
        } catch (err) {
            logger.warn('Failed to subscribe', { streamPartId, reason: err?.reason })
            return
        }
        this.subscriptions.set(streamPartId, subscription)
    })

    private onRemoveStakedStreamPart = this.concurrencyLimiter(async (streamPartId: StreamPartID): Promise<void> => {
        const subscription = this.subscriptions.get(streamPartId)
        this.subscriptions.delete(streamPartId)
        try {
            await subscription?.unsubscribe()
        } catch (err) {
            logger.warn('Failed to unsubscribe', { streamPartId, reason: err?.reason })
        }
    })

    private concurrencyLimiter(
        fn: (streamPartId: StreamPartID) => Promise<void>
    ): (streamPartId: StreamPartID) => void {
        return (streamPartId) => {
            this.concurrencyLimit(() => fn(streamPartId)).catch((err) => {
                logger.warn('Encountered error while processing event', { err })
            })
        }
    }
}
