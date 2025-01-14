import { AbortError, composeAbortSignals, EthereumAddress, Gate, Logger, wait } from '@streamr/utils'
import { StreamrClient } from '@streamr/sdk'
import { CreateOperatorFleetStateFn, OperatorFleetState } from './OperatorFleetState'
import {
    findNodesForTargetGivenFleetState,
    FindNodesForTargetGivenFleetStateFn,
    inspectTarget,
    InspectTargetFn,
    Target
} from './inspectionUtils'
import { formCoordinationStreamId } from './formCoordinationStreamId'
import range from 'lodash/range'

interface InspectOverTimeOpts {
    target: Target
    streamrClient: StreamrClient
    createOperatorFleetState: CreateOperatorFleetStateFn
    getRedundancyFactor: (operatorContractAddress: EthereumAddress) => Promise<number | undefined>
    delayBeforeFirstInspectionInMs: number
    heartbeatTimeoutInMs: number
    inspectionIntervalInMs: number
    maxInspectionCount: number
    waitUntilPassOrDone: boolean
    abortSignal: AbortSignal
    traceId: string
    findNodesForTargetGivenFleetStateFn?: FindNodesForTargetGivenFleetStateFn
    inspectTargetFn?: InspectTargetFn
}

export function inspectOverTime(opts: InspectOverTimeOpts): () => Promise<boolean[]> {
    const task = new InspectionOverTimeTask(opts)
    task.start()
    return async () => {
        if (opts.waitUntilPassOrDone) {
            await task.waitUntilPassOrDone()
        }
        task.destroy()
        return task.calculateResult()
    }
}

class InspectionOverTimeTask {
    private readonly target: Target
    private readonly streamrClient: StreamrClient
    private readonly createOperatorFleetState: CreateOperatorFleetStateFn
    private readonly getRedundancyFactor: (operatorContractAddress: EthereumAddress) => Promise<number | undefined>
    private readonly delayBeforeFirstInspectionInMs: number
    private readonly heartbeatTimeoutInMs: number
    private readonly inspectionIntervalInMs: number
    private readonly maxInspectionCount: number
    private readonly abortSignal: AbortSignal
    private readonly findNodesForTargetGivenFleetStateFn: FindNodesForTargetGivenFleetStateFn
    private readonly inspectTargetFn: InspectTargetFn
    private readonly logger: Logger

    private fleetState?: OperatorFleetState
    private readonly inspectionResults = new Array<boolean>()
    private readonly abortController = new AbortController()
    private readonly passedSingleInspectionGate = new Gate(false)
    private readonly doneGate = new Gate(false)

    constructor({
        target,
        streamrClient,
        createOperatorFleetState,
        getRedundancyFactor,
        delayBeforeFirstInspectionInMs,
        heartbeatTimeoutInMs,
        inspectionIntervalInMs,
        maxInspectionCount,
        abortSignal: userAbortSignal,
        traceId,
        findNodesForTargetGivenFleetStateFn = findNodesForTargetGivenFleetState,
        inspectTargetFn = inspectTarget
    }: InspectOverTimeOpts) {
        this.target = target
        this.streamrClient = streamrClient
        this.createOperatorFleetState = createOperatorFleetState
        this.getRedundancyFactor = getRedundancyFactor
        this.delayBeforeFirstInspectionInMs = delayBeforeFirstInspectionInMs
        this.heartbeatTimeoutInMs = heartbeatTimeoutInMs
        this.inspectionIntervalInMs = inspectionIntervalInMs
        this.maxInspectionCount = maxInspectionCount
        this.abortSignal = composeAbortSignals(userAbortSignal, this.abortController.signal)
        this.findNodesForTargetGivenFleetStateFn = findNodesForTargetGivenFleetStateFn
        this.inspectTargetFn = inspectTargetFn
        this.logger = new Logger(module, { traceId })
        this.abortSignal.addEventListener('abort', async () => {
            await this.fleetState?.destroy()
        })
    }

    calculateResult(): boolean[] {
        const passCount = this.inspectionResults.filter((pass) => pass).length
        this.logger.info('Inspection done', {
            passFraction: `${passCount}/${this.inspectionResults.length}`,
            inspectionResults: this.inspectionResults
        })
        return this.inspectionResults
    }

    start(): void {
        this.run().catch((err) => {
            if (!(err instanceof AbortError) && err?.reason !== 'AbortError') {
                this.logger.warn('Error encountered', { err })
                this.destroy()
            }
        })
    }

    waitUntilPassOrDone(): Promise<void> {
        return Promise.race([this.doneGate.waitUntilOpen(), this.passedSingleInspectionGate.waitUntilOpen()])
    }

    destroy(): void {
        this.abortController.abort()
        this.doneGate.open()
    }

    private async run(): Promise<void> {
        this.logger.info('Start', {
            target: this.target,
            heartbeatTimeoutInMs: this.heartbeatTimeoutInMs,
            inspectionIntervalInMs: this.inspectionIntervalInMs,
            maxInspectionCount: this.maxInspectionCount
        })

        await this.initializeNewOperatorFleetState()

        this.logger.debug('Sleep', { timeInMs: this.delayBeforeFirstInspectionInMs })
        await wait(this.delayBeforeFirstInspectionInMs, this.abortSignal)

        for (const attemptNo of range(1, this.maxInspectionCount + 1)) {
            const startTime = Date.now()
            this.logger.info('Inspecting target', { attemptNo, target: this.target })

            const onlineNodeDescriptors = await this.findNodesForTargetGivenFleetStateFn(
                this.target,
                this.fleetState!,
                this.getRedundancyFactor,
                this.logger
            )
            this.abortSignal.throwIfAborted()
            const pass = await this.inspectTargetFn({
                target: this.target,
                targetPeerDescriptors: onlineNodeDescriptors,
                streamrClient: this.streamrClient,
                abortSignal: this.abortSignal,
                logger: this.logger
            })
            this.inspectionResults.push(pass)
            if (pass) {
                this.passedSingleInspectionGate.open()
            }
            const timeElapsedInMs = Date.now() - startTime
            this.logger.info('Inspected target', {
                attemptNo,
                pass,
                timeElapsedInMs,
                target: this.target
            })

            if (attemptNo !== this.maxInspectionCount) {
                // TODO: remove when NET-1169 landed;
                //  workaround subscribe bug in @streamr/sdk (sometimes messages don't come thru to heartbeat stream)
                if (this.fleetState?.getNodeIds().length === 0) {
                    this.logger.info('Destroying and re-creating fleet state')
                    if (this.fleetState !== undefined) {
                        await this.fleetState.destroy()
                    }
                    this.abortSignal.throwIfAborted()
                    await this.initializeNewOperatorFleetState()
                    this.abortSignal.throwIfAborted()
                }

                const sleepTime = Math.max(this.inspectionIntervalInMs - timeElapsedInMs, 0)
                this.logger.debug('Sleep', { timeInMs: sleepTime })
                await wait(sleepTime, this.abortSignal)
            }
        }

        this.doneGate.open()
    }

    private async initializeNewOperatorFleetState(): Promise<void> {
        this.fleetState = this.createOperatorFleetState(formCoordinationStreamId(this.target.operatorAddress))
        await this.fleetState.start()
        this.logger.info('Waiting for fleet state')
        await Promise.race([this.fleetState.waitUntilReady(), wait(this.heartbeatTimeoutInMs, this.abortSignal)])
        this.logger.info('Wait done for fleet state', { onlineNodeCount: this.fleetState.getNodeIds().length })
    }
}
