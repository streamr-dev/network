import { EthereumAddress, Logger, scheduleAtInterval } from '@streamr/utils'
import { InspectRandomNodeHelper } from './InspectRandomNodeHelper'
import { StreamAssignmentLoadBalancer } from './StreamAssignmentLoadBalancer'
import sample from 'lodash/sample'
import { StreamrClient } from 'streamr-client'
import { StreamID, StreamPartID, StreamPartIDUtils } from '@streamr/protocol'
import without from 'lodash/without'
import { weightedSample } from '../../helpers/weightedSample'
import { fetchRedundancyFactor } from './fetchRedundancyFactor'
import { inspectTarget, Target } from './inspectionUtils'

const logger = new Logger(module)

function createStreamIDMatcher(streamId: StreamID): (streamPart: StreamPartID) => boolean {
    return (streamPart) => {
        return StreamPartIDUtils.getStreamID(streamPart) === streamId
    }
}

function isAnyPartitionOfStreamAssignedToMe(
    loadBalancer: StreamAssignmentLoadBalancer,
    streamId: StreamID
): boolean {
    return loadBalancer.getMyStreamParts().some(createStreamIDMatcher(streamId))
}

function getPartitionsOfStreamAssignedToMe(
    loadBalancer: StreamAssignmentLoadBalancer,
    streamId: StreamID
): StreamPartID[] {
    return loadBalancer.getMyStreamParts().filter(createStreamIDMatcher(streamId))
}

export async function findTarget(
    myOperatorContractAddress: EthereumAddress,
    helper: InspectRandomNodeHelper,
    loadBalancer: StreamAssignmentLoadBalancer
): Promise<Target | undefined> {
    // choose sponsorship
    const sponsorships = await helper.getSponsorshipsOfOperator(myOperatorContractAddress)
    const suitableSponsorships = sponsorships
        .filter(({ operatorCount }) => operatorCount >= 2)  // exclude sponsorships with only self
        .filter(({ streamId }) => isAnyPartitionOfStreamAssignedToMe(loadBalancer, streamId))
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
    const streamParts = getPartitionsOfStreamAssignedToMe(loadBalancer, targetSponsorship.streamId)
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

export type FindTargetFn = typeof findTarget
export type InspectTargetFn = typeof inspectTarget
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
    private readonly inspectTarget: InspectTargetFn
    private readonly fetchRedundancyFactor: FetchRedundancyFactorFn

    constructor(
        operatorContractAddress: EthereumAddress,
        helper: InspectRandomNodeHelper,
        streamAssignmentLoadBalancer: StreamAssignmentLoadBalancer,
        streamrClient: StreamrClient,
        intervalInMs: number,
        heartbeatLastResortTimeoutInMs: number,
        findTargetFn = findTarget,
        inspectTargetFn = inspectTarget,
        fetchRedundancyFactorFn = fetchRedundancyFactor
    ) {
        this.operatorContractAddress = operatorContractAddress
        this.helper = helper
        this.loadBalancer = streamAssignmentLoadBalancer
        this.streamrClient = streamrClient
        this.intervalInMs = intervalInMs
        this.heartbeatLastResortTimeoutInMs = heartbeatLastResortTimeoutInMs
        this.findTarget = findTargetFn
        this.inspectTarget = inspectTargetFn
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

    stop(): void {
        this.abortController.abort()
    }

    private inspect = async () => {
        logger.info('Select a random operator to inspect')

        const target = await this.findTarget(this.operatorContractAddress, this.helper, this.loadBalancer)
        if (target === undefined) {
            return
        }

        const pass = await this.inspectTarget({
            target,
            streamrClient: this.streamrClient,
            fetchRedundancyFactor: this.fetchRedundancyFactor,
            heartbeatLastResortTimeoutInMs: this.heartbeatLastResortTimeoutInMs,
            abortSignal: this.abortController.signal
        })

        if (!pass) {
            logger.info('Raise flag', { target })
            await this.helper.flagWithMetadata(
                target.sponsorshipAddress,
                target.operatorAddress,
                StreamPartIDUtils.getStreamPartition(target.streamPart)
            )
        }
    }
}
