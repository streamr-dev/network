import { Logger } from '@streamr/utils'
import { StreamrClient, Subscription } from 'streamr-client'
import { StreamPartID, StreamPartIDUtils } from '@streamr/protocol'
import pLimit from 'p-limit'
import { StreamAssignmentLoadBalancer } from './StreamAssignmentLoadBalancer'
import { MaintainTopologyHelper } from './MaintainTopologyHelper'
import { OperatorServiceConfig } from './OperatorPlugin'
import { OperatorFleetState } from './OperatorFleetState'

const logger = new Logger(module)

/**
 * Helper function for setting up and starting a MaintainTopologyService along
 * with all its dependencies.
 */
export async function setUpAndStartMaintainTopologyService({
    streamrClient,
    redundancyFactor,
    serviceHelperConfig,
    operatorFleetState
}: {
    streamrClient: StreamrClient
    redundancyFactor: number
    serviceHelperConfig: OperatorServiceConfig
    operatorFleetState: OperatorFleetState
}): Promise<MaintainTopologyService> {
    // TODO: check that operatorFleetState is NOT started
    const maintainTopologyHelper = new MaintainTopologyHelper(serviceHelperConfig)
    const nodeId = await streamrClient.getNodeId()
    const service = new MaintainTopologyService(
        streamrClient,
        new StreamAssignmentLoadBalancer(
            nodeId,
            redundancyFactor,
            async (streamId) => {
                const stream = await streamrClient.getStream(streamId)
                return stream.getStreamParts()
            },
            operatorFleetState,
            maintainTopologyHelper
        )
    )
    await service.start()
    await maintainTopologyHelper.start()
    return service
}

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
        this.streamAssignmentLoadBalancer.on('assigned', this.onAddStakedStreamPart)
        this.streamAssignmentLoadBalancer.on('unassigned', this.onRemoveStakedStreamPart)
        logger.info('Started')
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
