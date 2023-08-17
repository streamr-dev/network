import { Logger, scheduleAtInterval } from '@streamr/utils'
import { OperatorFleetState } from './OperatorFleetState'
import StreamrClient from 'streamr-client'
import { AnnounceNodeToContractHelper } from './AnnounceNodeToContractHelper'

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
        await scheduleAtInterval(async () => {
            if (await this.isHeartbeatStale() && await this.isLeader()) {
                await this.writeHeartbeat()
            }
        }, this.pollIntervalInMs, true, this.abortController.signal)
    }

    async stop(): Promise<void> {
        this.abortController.abort()
    }

    private async isHeartbeatStale(): Promise<boolean> {
        logger.debug('Polling last heartbeat timestamp', {
            operatorContractAddress: this.helper.getOperatorContractAddress()
        })
        let lastHeartbeatTs
        try {
            lastHeartbeatTs = await this.helper.getTimestampOfLastHeartbeat()
        } catch (err) {
            logger.warn('Failed to poll last heartbeat timestamp', { reason: err?.message })
            return false // we don't know if heartbeat is stale, but we don't want execution to continue
        }
        const stale = lastHeartbeatTs !== undefined ? lastHeartbeatTs + this.writeIntervalInMs <= Date.now() : true
        logger.debug('Polled last heartbeat timestamp', { lastHeartbeatTs, stale })
        return stale
    }

    private async isLeader(): Promise<boolean> {
        const myNodeId = (await this.streamrClient.getNode()).getNodeId()
        const leaderNodeId = this.operatorFleetState.getLeaderNodeId()
        const isLeader = myNodeId === leaderNodeId
        logger.debug('Check if leader', { isLeader, leaderNodeId, myNodeId })
        return isLeader
    }

    private async writeHeartbeat(): Promise<void> {
        logger.info('Write heartbeat')
        try {
            const nodeDescriptor = await this.streamrClient.getPeerDescriptor()
            await this.helper.writeHeartbeat(nodeDescriptor)
            logger.debug('Wrote heartbeat', { nodeDescriptor })
        } catch (err) {
            logger.warn('Failed to write heartbeat', { reason: err?.message })
        }
    }
}
