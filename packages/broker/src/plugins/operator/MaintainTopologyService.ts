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
    serviceHelperConfig,
    operatorFleetState
}: {
    streamrClient: StreamrClient
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
