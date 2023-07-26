import { Logger } from '@streamr/utils'
import StreamrClient, { Subscription } from 'streamr-client'
import { StreamPartID, StreamPartIDUtils, toStreamID } from '@streamr/protocol'
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
    replicationFactor,
    serviceHelperConfig,
    operatorFleetState
}: {
    streamrClient: StreamrClient
    replicationFactor: number
    serviceHelperConfig: OperatorServiceConfig
    operatorFleetState?: OperatorFleetState
}): Promise<MaintainTopologyService> {
    const operatorFleetStateGiven = operatorFleetState !== undefined
    if (operatorFleetState === undefined) {
        const coordinationStreamId = toStreamID('/operator/coordination', serviceHelperConfig.operatorContractAddress)
        operatorFleetState = new OperatorFleetState(streamrClient, coordinationStreamId)
    }
    const maintainTopologyHelper = new MaintainTopologyHelper(serviceHelperConfig)
    const nodeId = (await streamrClient.getNode()).getNodeId()
    const service = new MaintainTopologyService(
        streamrClient,
        new StreamAssignmentLoadBalancer(
            nodeId,
            replicationFactor,
            async (streamId) => {
                const stream = await streamrClient.getStream(streamId)
                return stream.getStreamParts()
            },
            operatorFleetState,
            maintainTopologyHelper
        )
    )
    await service.start()
    if (!operatorFleetStateGiven) {
        await operatorFleetState.start()
    }
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

    // eslint-disable-next-line class-methods-use-this
    async stop(): Promise<void> {
    }

    private onAddStakedStreamPart = this.concurrencyLimiter(async (streamPartId: StreamPartID): Promise<void> => {
        const id = StreamPartIDUtils.getStreamID(streamPartId)
        const partition = StreamPartIDUtils.getStreamPartition(streamPartId)
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
