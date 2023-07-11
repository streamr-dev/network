import { Logger } from '@streamr/utils'
import StreamrClient, { Subscription } from 'streamr-client'
import { StreamPartID, StreamPartIDUtils } from '@streamr/protocol'
import pLimit from 'p-limit'
import { StreamAssignmentLoadBalancer } from './StreamAssignmentLoadBalancer'

const logger = new Logger(module)

export class MaintainTopologyService {
    private readonly streamrClient: StreamrClient
    private readonly streamAssignmentLoadBalancer: StreamAssignmentLoadBalancer
    private readonly subscriptions = new Map<StreamPartID, Subscription>()
    private readonly concurrencyLimit = pLimit(1)

    constructor(streamrClient: StreamrClient, streamAssignmentLoadBalancer: StreamAssignmentLoadBalancer) {
        this.streamrClient = streamrClient
        this.streamAssignmentLoadBalancer = streamAssignmentLoadBalancer
    }

    async start(): Promise<void> {
        this.streamAssignmentLoadBalancer.on('assigned', this.onAddStakedStream)
        this.streamAssignmentLoadBalancer.on('unassigned', this.onRemoveStakedStream)
        logger.info('Started')
    }

    // eslint-disable-next-line class-methods-use-this
    async stop(): Promise<void> {
    }

    private onAddStakedStream = this.concurrencyLimiter(async (streamPartId: StreamPartID): Promise<void> => {
        const id = StreamPartIDUtils.getStreamID(streamPartId)
        const partition = StreamPartIDUtils.getStreamPartition(streamPartId)
        const subscription = await this.streamrClient.subscribe({
            id,
            partition,
            raw: true
        }) // TODO: rejects?
        this.subscriptions.set(streamPartId, subscription)
    })

    private onRemoveStakedStream = this.concurrencyLimiter(async (streamPartId: StreamPartID): Promise<void> => {
        const subscription = this.subscriptions.get(streamPartId)
        this.subscriptions.delete(streamPartId)
        await subscription?.unsubscribe() // TODO: rejects?
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
