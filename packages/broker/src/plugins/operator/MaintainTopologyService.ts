import { Logger } from '@streamr/utils'
import { StreamrClient, Subscription } from 'streamr-client'
import { StreamPartID, StreamPartIDUtils } from '@streamr/protocol'
import pLimit from 'p-limit'
import { StreamPartAssignments } from './StreamPartAssignments'
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
        new StreamPartAssignments(
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
    private readonly assignments: StreamPartAssignments
    private readonly subscriptions = new Map<StreamPartID, Subscription>()
    private readonly concurrencyLimit = pLimit(1)

    constructor(streamrClient: StreamrClient, assignments: StreamPartAssignments) {
        this.streamrClient = streamrClient
        this.assignments = assignments
    }

    async start(): Promise<void> {
        this.assignments.on('assigned', this.onAddStakedStreamPart)
        this.assignments.on('unassigned', this.onRemoveStakedStreamPart)
        logger.info('Started')
    }

    private onAddStakedStreamPart = this.concurrencyLimiter(async (streamPartId: StreamPartID): Promise<void> => {
        const [id, partition] = StreamPartIDUtils.getStreamIDAndPartition(streamPartId)
        let subscription: Subscription
        try {
            logger.info(`Join stream partition ${streamPartId}`)
            subscription = await this.streamrClient.subscribe({
                id,
                partition,
                raw: true
            })

			subscription.on('error', (err) => {
				logger.error(`Subscription error: ${err}`)
			})
        } catch (err) {
            logger.warn(`Failed to join stream partition ${streamPartId}`, { reason: err?.reason })
            return
        }
        this.subscriptions.set(streamPartId, subscription)
    })

    private onRemoveStakedStreamPart = this.concurrencyLimiter(async (streamPartId: StreamPartID): Promise<void> => {
        const subscription = this.subscriptions.get(streamPartId)
        this.subscriptions.delete(streamPartId)
        try {
            logger.info(`Leave stream partition ${streamPartId}`)
            await subscription?.unsubscribe()
        } catch (err) {
            logger.warn(`Failed to leave stream partition ${streamPartId}`, { reason: err?.reason })
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
