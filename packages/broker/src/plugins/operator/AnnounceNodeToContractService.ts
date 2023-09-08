import { Logger, scheduleAtInterval } from '@streamr/utils'
import { OperatorFleetState } from './OperatorFleetState'
import { StreamrClient } from 'streamr-client'
import { AnnounceNodeToContractHelper } from './AnnounceNodeToContractHelper'
import { createIsLeaderFn } from './createIsLeaderFn'
import { announceNodeToContract } from './announceNodeToContract'

const logger = new Logger(module)

export class AnnounceNodeToContractService {
    private readonly streamrClient: StreamrClient
    private readonly helper: AnnounceNodeToContractHelper
    private readonly operatorFleetState: OperatorFleetState
    private readonly writeIntervalInMs: number
    private readonly pollIntervalInMs: number
    private readonly abortController = new AbortController()

    constructor(
        streamrClient: StreamrClient,
        helper: AnnounceNodeToContractHelper,
        operatorFleetState: OperatorFleetState,
        writeIntervalInMs = 24 * 60 * 60 * 1000,
        pollIntervalInMs = 10 * 60 * 1000
    ) {
        this.streamrClient = streamrClient
        this.helper = helper
        this.operatorFleetState = operatorFleetState
        this.writeIntervalInMs = writeIntervalInMs
        this.pollIntervalInMs = pollIntervalInMs
    }

    async start(): Promise<void> {
        await this.operatorFleetState.waitUntilReady()
        const isLeader = await createIsLeaderFn(this.streamrClient, this.operatorFleetState, logger)
        await scheduleAtInterval(async () => {
            if (isLeader()) {
                await announceNodeToContract(this.writeIntervalInMs, this.helper, this.streamrClient)
            }
        }, this.pollIntervalInMs, true, this.abortController.signal)
    }

    async stop(): Promise<void> {
        this.abortController.abort()
    }
}
