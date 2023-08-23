import { EthereumAddress, Logger, scheduleAtInterval, wait } from '@streamr/utils'
import { InspectRandomNodeHelper } from './InspectRandomNodeHelper'
import { OperatorFleetState } from './OperatorFleetState'
import { StreamAssignmentLoadBalancer } from './StreamAssignmentLoadBalancer'
import sample from 'lodash/sample'
import { StreamrClient, NetworkPeerDescriptor } from 'streamr-client'
import { StreamPartID, StreamPartIDUtils, toStreamID } from '@streamr/protocol'
import { ConsistentHashRing } from './ConsistentHashRing'
import without from 'lodash/without'
import { weightedSample } from '../../helpers/weightedSample'
import { fetchRedundancyFactor } from './fetchRedundancyFactor'

const logger = new Logger(module)

interface Target {
    sponsorshipAddress: EthereumAddress
    operatorAddress: EthereumAddress
    streamPart: StreamPartID
}

export async function findTarget(
    myOperatorContractAddress: EthereumAddress,
    helper: InspectRandomNodeHelper,
    loadBalancer: StreamAssignmentLoadBalancer
): Promise<Target | undefined> {
    // choose sponsorship
    const sponsorships = await helper.getSponsorshipsOfOperator(myOperatorContractAddress)
    const suitableSponsorships = sponsorships
        .filter(({ operatorCount }) => operatorCount >= 2)  // TODO: could this filtering be done in the graphql query?
        .filter(({ streamId }) => loadBalancer.isAnyPartitionOfStreamAssignedToMe(streamId))
    if (suitableSponsorships.length === 0) {
        logger.info('Skip inspection (no suitable sponsorship)', { totalSponsorships: sponsorships.length })
        return undefined
    }
    const targetSponsorship = weightedSample(
        suitableSponsorships,
        ({ operatorCount }) => operatorCount - 1 // account for self to keep ratios correct
    )!

    // choose operator
    const operators = await helper.getOperatorsInSponsorship(targetSponsorship.sponsorshipAddress)
    const targetOperatorAddress = sample(without(operators, myOperatorContractAddress))
    if (targetOperatorAddress === undefined) {
        // Only happens if during the async awaits the other operator(s) were removed from the sponsorship.
        logger.info('Skip inspection (no suitable operator)', { targetSponsorship })
        return undefined
    }

    // choose stream part
    const streamParts = loadBalancer.getPartitionsOfStreamAssignedToMe(targetSponsorship.streamId)
    const targetStreamPart = sample(streamParts)
    if (targetStreamPart === undefined) {
        // Only happens if during the async awaits the stream parts I am assigned to have changed.
        logger.info('Skip inspection (no suitable stream part)', { targetSponsorship, targetOperatorAddress })
        return undefined
    }

    return {
        sponsorshipAddress: targetSponsorship.sponsorshipAddress,
        operatorAddress: targetOperatorAddress,
        streamPart: targetStreamPart
    }
}

export async function findNodesForTarget(
    target: Target,
    streamrClient: StreamrClient,
    fetchRedundancyFactorFn: FetchRedundancyFactorFn,
    maxWait: number,
    abortSignal: AbortSignal
): Promise<NetworkPeerDescriptor[]> {
    logger.debug('Waiting for node heartbeats', {
        targetOperator: target.operatorAddress,
        maxWait
    })
    const targetOperatorFleetState = new OperatorFleetState(
        streamrClient,
        toStreamID('/operator/coordination', target.operatorAddress)
    )
    try {
        await targetOperatorFleetState.start()
        await Promise.race([
            targetOperatorFleetState.waitUntilReady(),
            wait(maxWait, abortSignal)
        ])
        logger.debug('Finished waiting for heartbeats', {
            targetOperator: target.operatorAddress,
            onlineNodes: targetOperatorFleetState.getNodeIds().length,
        })

        const replicationFactor = await fetchRedundancyFactorFn({
            operatorContractAddress: target.operatorAddress,
            signer: await streamrClient.getSigner()
        })
        if (replicationFactor === undefined) {
            logger.debug('Encountered misconfigured replication factor')
            return []
        }

        const consistentHashRing = new ConsistentHashRing(replicationFactor)
        for (const nodeId of targetOperatorFleetState.getNodeIds()) {
            consistentHashRing.add(nodeId)
        }
        const targetNodes = consistentHashRing.get(target.streamPart)
        return targetNodes.map((nodeId) => targetOperatorFleetState.getPeerDescriptor(nodeId)!)
    } finally {
        await targetOperatorFleetState.destroy()
    }
}

export type FindTargetFn = typeof findTarget
export type FindNodesForTargetFn = typeof findNodesForTarget
export type FetchRedundancyFactorFn = typeof fetchRedundancyFactor

export class InspectRandomNodeService {
    private readonly operatorContractAddress: EthereumAddress
    private readonly helper: InspectRandomNodeHelper
    private readonly loadBalancer: StreamAssignmentLoadBalancer
    private readonly streamrClient: StreamrClient
    private readonly intervalInMs = 15 * 60 * 1000
    private readonly heartbeatLastResortTimeoutInMs = 60 * 1000
    private readonly abortController = new AbortController()
    private readonly findTarget: FindTargetFn
    private readonly findNodesForTarget: FindNodesForTargetFn
    private readonly fetchRedundancyFactor: FetchRedundancyFactorFn

    constructor(
        operatorContractAddress: EthereumAddress,
        helper: InspectRandomNodeHelper,
        streamAssignmentLoadBalancer: StreamAssignmentLoadBalancer,
        streamrClient: StreamrClient,
        intervalInMs: number,
        heartbeatLastResortTimeoutInMs: number,
        findTargetFn = findTarget,
        findNodesForTargetFn = findNodesForTarget,
        fetchRedundancyFactorFn = fetchRedundancyFactor
    ) {
        this.operatorContractAddress = operatorContractAddress
        this.helper = helper
        this.loadBalancer = streamAssignmentLoadBalancer
        this.streamrClient = streamrClient
        this.intervalInMs = intervalInMs
        this.heartbeatLastResortTimeoutInMs = heartbeatLastResortTimeoutInMs
        this.findTarget = findTargetFn
        this.findNodesForTarget = findNodesForTargetFn
        this.fetchRedundancyFactor = fetchRedundancyFactorFn
    }

    async start(): Promise<void> {
        await scheduleAtInterval(async () => {
            try {
                await this.inspect()
            } catch (err) {
                logger.error('Encountered error', { err })
            }
        }, this.intervalInMs, false, this.abortController.signal)
    }

    async stop(): Promise<void> {
        this.abortController.abort()
    }

    private inspect = async () => {
        logger.info('Select a random operator to inspect')

        const target = await this.findTarget(this.operatorContractAddress, this.helper, this.loadBalancer)
        if (target === undefined) {
            return
        }

        const targetPeerDescriptors = await this.findNodesForTarget(
            target,
            this.streamrClient,
            this.fetchRedundancyFactor,
            this.heartbeatLastResortTimeoutInMs,
            this.abortController.signal
        )

        logger.info('Inspecting nodes of operator', {
            targetOperator: target.operatorAddress,
            targetStreamPart: target.streamPart,
            targetNodes: targetPeerDescriptors.map(({ id }) => id),
            targetSponsorship: target.sponsorshipAddress
        })

        for (const descriptor of targetPeerDescriptors) {
            const result = await this.streamrClient.inspect(descriptor, target.streamPart)
            if (result) {
                logger.info('Inspection done (no issue detected)', {
                    targetOperator: target.operatorAddress,
                    targetStreamPart: target.streamPart,
                    targetNode: descriptor.id,
                    targetSponsorship: target.sponsorshipAddress
                })
                return
            }
        }

        logger.info('Raise flag (issue detected)', {
            targetOperator: target.operatorAddress,
            targetStreamPart: target.streamPart,
            targetNodes: targetPeerDescriptors.map(({ id }) => id),
            targetSponsorship: target.sponsorshipAddress
        })
        await this.helper.flagWithMetadata(
            target.sponsorshipAddress,
            target.operatorAddress,
            StreamPartIDUtils.getStreamPartition(target.streamPart)
        )
    }
}
