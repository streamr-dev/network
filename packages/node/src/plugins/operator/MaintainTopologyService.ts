import { StreamrClient, Subscription } from '@streamr/sdk'
import { Logger, StreamPartID, StreamPartIDUtils } from '@streamr/utils'
import pLimit from 'p-limit'
import { StreamPartAssignments } from './StreamPartAssignments'

const logger = new Logger(module)

export class MaintainTopologyService {
    private readonly streamrClient: StreamrClient
    private readonly subscriptions = new Map<StreamPartID, Subscription>()
    private readonly concurrencyLimit = pLimit(1)

    constructor(streamrClient: StreamrClient, assignments: StreamPartAssignments) {
        this.streamrClient = streamrClient
        assignments.on('assigned', this.onAddStakedStreamPart)
        assignments.on('unassigned', this.onRemoveStakedStreamPart)
    }

    private onAddStakedStreamPart = this.concurrencyLimiter(async (streamPartId: StreamPartID): Promise<void> => {
        const [id, partition] = StreamPartIDUtils.getStreamIDAndPartition(streamPartId)
        let subscription: Subscription
        try {
            logger.info('Join stream partition', { streamPartId })
            subscription = await this.streamrClient.subscribe(
                {
                    id,
                    partition,
                    raw: true
                },
                () => {}
            )
        } catch (err) {
            logger.warn('Failed to join stream partition', { streamPartId, reason: err?.reason })
            return
        }
        this.subscriptions.set(streamPartId, subscription)
    })

    private onRemoveStakedStreamPart = this.concurrencyLimiter(async (streamPartId: StreamPartID): Promise<void> => {
        const subscription = this.subscriptions.get(streamPartId)
        this.subscriptions.delete(streamPartId)
        try {
            logger.info('Leave stream partition', { streamPartId })
            await subscription?.unsubscribe()
        } catch (err) {
            logger.warn('Failed to leave stream partition', { streamPartId, reason: err?.reason })
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
