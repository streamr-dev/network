import { AbortError, composeAbortSignals, EthereumAddress, Gate, Logger, wait } from '@streamr/utils'
import { StreamrClient } from 'streamr-client'
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
    sleepTimeInMsBeforeFirstInspection: number
    heartbeatTimeoutInMs: number
    inspectionIntervalInMs: number
    maxInspections: number
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
    private readonly sleepTimeInMsBeforeFirstInspection: number
    private readonly heartbeatTimeoutInMs: number
    private readonly inspectionIntervalInMs: number
    private readonly maxInspections: number
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
        sleepTimeInMsBeforeFirstInspection,
        heartbeatTimeoutInMs,
        inspectionIntervalInMs,
        maxInspections,
        abortSignal: userAbortSignal,
        traceId,
        findNodesForTargetGivenFleetStateFn = findNodesForTargetGivenFleetState,
        inspectTargetFn = inspectTarget,
    }: InspectOverTimeOpts) {
        this.target = target
        this.streamrClient = streamrClient
        this.createOperatorFleetState = createOperatorFleetState
        this.getRedundancyFactor = getRedundancyFactor
        this.sleepTimeInMsBeforeFirstInspection = sleepTimeInMsBeforeFirstInspection
        this.heartbeatTimeoutInMs = heartbeatTimeoutInMs
        this.inspectionIntervalInMs = inspectionIntervalInMs
        this.maxInspections = maxInspections
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
        return Promise.race([
            this.doneGate.waitUntilOpen(),
            this.passedSingleInspectionGate.waitUntilOpen()
        ])
    }

    destroy(): void {
        this.abortController.abort()
    }

    private async run(): Promise<void> {
        this.logger.info('Start', {
            target: this.target,
            heartbeatTimeoutInMs: this.heartbeatTimeoutInMs,
            inspectionIntervalInMs: this.inspectionIntervalInMs,
            maxInspections: this.maxInspections
        })

        await this.initializeNewOperatorFleetState()

        this.logger.info('Sleep', { timeInMs: this.sleepTimeInMsBeforeFirstInspection })
        await wait(this.sleepTimeInMsBeforeFirstInspection, this.abortSignal)

        for (const attemptNo of range(1, this.maxInspections + 1)) {
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

            if (attemptNo !== this.maxInspections) {
                // TODO: remove when NET-1169 landed;
                //  workaround subscribe bug in streamr-client (sometimes messages don't come thru to heartbeat stream)
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
                this.logger.info('Sleep', { timeInMs: sleepTime })
                await wait(sleepTime, this.abortSignal)
            }
        }

        this.doneGate.open()
    }

    private async initializeNewOperatorFleetState(): Promise<void> {
        this.fleetState = this.createOperatorFleetState(formCoordinationStreamId(this.target.operatorAddress))
        await this.fleetState.start()
        this.logger.info('Waiting for fleet state')
        await Promise.race([
            this.fleetState.waitUntilReady(),
            wait(this.heartbeatTimeoutInMs, this.abortSignal)
        ])
        this.logger.info('Wait done for fleet state', { onlineNodeCount: this.fleetState.getNodeIds().length })
    }
}
