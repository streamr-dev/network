import { AbortError, composeAbortSignals, EthereumAddress, Gate, Logger, randomString, wait } from '@streamr/utils'
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
    abortSignal: AbortSignal
    findNodesForTargetGivenFleetStateFn?: FindNodesForTargetGivenFleetStateFn
    inspectTargetFn?: InspectTargetFn
}

export interface InspectionOverTimeResult {
    getResultsImmediately: () => boolean
    waitForResults: () => Promise<boolean>
}

export function inspectOverTime(opts: InspectOverTimeOpts): InspectionOverTimeResult {
    const task = new InspectionOverTimeTask(opts)
    task.start()
    return {
        getResultsImmediately: () => {
            task.destroy()
            return task.calculateResult()
        },
        waitForResults: async () => {
            await task.waitUntilDone()
            return task.calculateResult()
        }
    }
}

class InspectionOverTimeTask {
    private readonly target: Target
    private readonly streamrClient: StreamrClient
    private readonly fleetState: OperatorFleetState
    private readonly getRedundancyFactor: (operatorContractAddress: EthereumAddress) => Promise<number | undefined>
    private readonly sleepTimeInMsBeforeFirstInspection: number
    private readonly heartbeatTimeoutInMs: number
    private readonly inspectionIntervalInMs: number
    private readonly maxInspections: number
    private readonly abortSignal: AbortSignal
    private readonly findNodesForTargetGivenFleetStateFn: FindNodesForTargetGivenFleetStateFn
    private readonly inspectTargetFn: InspectTargetFn

    private readonly inspectionResults = new Array<boolean>()
    private readonly abortController = new AbortController()
    private readonly doneGate = new Gate(false)
    private readonly logger = new Logger(module, { id: randomString(6) })

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
        findNodesForTargetGivenFleetStateFn = findNodesForTargetGivenFleetState,
        inspectTargetFn = inspectTarget,
    }: InspectOverTimeOpts) {
        this.target = target
        this.streamrClient = streamrClient
        this.fleetState = createOperatorFleetState(formCoordinationStreamId(target.operatorAddress))
        this.getRedundancyFactor = getRedundancyFactor
        this.sleepTimeInMsBeforeFirstInspection = sleepTimeInMsBeforeFirstInspection
        this.heartbeatTimeoutInMs = heartbeatTimeoutInMs
        this.inspectionIntervalInMs = inspectionIntervalInMs
        this.maxInspections = maxInspections
        this.abortSignal = composeAbortSignals(userAbortSignal, this.abortController.signal)
        this.findNodesForTargetGivenFleetStateFn = findNodesForTargetGivenFleetStateFn
        this.inspectTargetFn = inspectTargetFn
        this.abortSignal.addEventListener('abort', async () => {
            await this.fleetState.destroy()
        })
    }

    calculateResult(): boolean {
        const passCount = this.inspectionResults.filter((pass) => pass).length
        const pass = passCount > this.inspectionResults.length / 2
        this.logger.info('Inspection done', {
            pass,
            passFraction: `${passCount} / ${this.inspectionResults.length}`,
            inspectionResults: this.inspectionResults
        })
        return pass
    }

    start(): void {
        this.run().catch((err) => {
            if (!(err instanceof AbortError) && err?.reason !== 'AbortError') {
                this.logger.warn('Error encountered', { err })
                this.destroy()
            }
        })
    }

    waitUntilDone(): Promise<void> {
        return this.doneGate.waitUntilOpen()
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

        await this.fleetState.start()
        this.logger.info('Waiting for fleet state')
        await Promise.race([
            this.fleetState.waitUntilReady(),
            wait(this.heartbeatTimeoutInMs, this.abortSignal)
        ])
        this.logger.info('Wait done for fleet state', { onlineNodeCount: this.fleetState.getNodeIds().length })

        this.logger.info('Sleep', { timeInMs: this.sleepTimeInMsBeforeFirstInspection })
        await wait(this.sleepTimeInMsBeforeFirstInspection, this.abortSignal)

        for (const attemptNo of range(1, this.maxInspections + 1)) {
            const startTime = Date.now()
            this.logger.info('Inspecting target', { attemptNo, target: this.target })

            const onlineNodeDescriptors = await this.findNodesForTargetGivenFleetStateFn(
                this.target,
                this.fleetState,
                this.getRedundancyFactor
            )
            this.abortSignal.throwIfAborted()
            const pass = await this.inspectTargetFn({
                target: this.target,
                targetPeerDescriptors: onlineNodeDescriptors,
                streamrClient: this.streamrClient,
                abortSignal: this.abortSignal
            })
            this.inspectionResults.push(pass)
            const timeElapsedInMs = Date.now() - startTime
            this.logger.info('Inspected target', {
                attemptNo,
                pass,
                timeElapsedInMs,
                target: this.target
            })

            const sleepTime = Math.max(this.inspectionIntervalInMs - timeElapsedInMs, 0)
            this.logger.info('Sleep', { timeInMs: sleepTime })
            await wait(sleepTime, this.abortSignal)
        }

        this.doneGate.close()
    }
}
