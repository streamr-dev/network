import { EthereumAddress, Logger, scheduleAtInterval } from '@streamr/utils'
import { InspectRandomNodeHelper } from './InspectRandomNodeHelper'
import { StreamAssignmentLoadBalancer } from './StreamAssignmentLoadBalancer'
import { StreamrClient } from 'streamr-client'
import { StreamPartIDUtils } from '@streamr/protocol'
import { findTarget, inspectTarget } from './inspectionUtils'

const logger = new Logger(module)

export type FindTargetFn = typeof findTarget
export type InspectTargetFn = typeof inspectTarget

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
    private readonly getRedundancyFactor: (operatorContractAddress: EthereumAddress) => Promise<number | undefined>

    constructor(
        operatorContractAddress: EthereumAddress,
        helper: InspectRandomNodeHelper,
        streamAssignmentLoadBalancer: StreamAssignmentLoadBalancer,
        streamrClient: StreamrClient,
        intervalInMs: number,
        heartbeatLastResortTimeoutInMs: number,
        getRedundancyFactor: (operatorContractAddress: EthereumAddress) => Promise<number | undefined>,
        findTargetFn = findTarget,
        inspectTargetFn = inspectTarget,
    ) {
        this.operatorContractAddress = operatorContractAddress
        this.helper = helper
        this.loadBalancer = streamAssignmentLoadBalancer
        this.streamrClient = streamrClient
        this.intervalInMs = intervalInMs
        this.heartbeatLastResortTimeoutInMs = heartbeatLastResortTimeoutInMs
        this.findTarget = findTargetFn
        this.inspectTarget = inspectTargetFn
        this.getRedundancyFactor = getRedundancyFactor
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
            getRedundancyFactor: this.getRedundancyFactor,
            heartbeatLastResortTimeoutInMs: this.heartbeatLastResortTimeoutInMs,
            abortSignal: this.abortController.signal
        })

        if (!pass) {
            logger.info('Raise flag', { target })
            await this.helper.flag(
                target.sponsorshipAddress,
                target.operatorAddress,
                StreamPartIDUtils.getStreamPartition(target.streamPart)
            )
        }
    }
}
