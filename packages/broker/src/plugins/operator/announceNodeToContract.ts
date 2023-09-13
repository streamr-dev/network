import { Logger } from '@streamr/utils'
import { AnnounceNodeToContractHelper } from './AnnounceNodeToContractHelper'
import StreamrClient from 'streamr-client'

const logger = new Logger(module)

export const announceNodeToContract = async (
    writeIntervalInMs: number,
    helper: AnnounceNodeToContractHelper,
    streamrClient: StreamrClient
): Promise<void> => {
    if (await isHeartbeatStale(writeIntervalInMs, helper)) {
        await writeHeartbeat(helper, streamrClient)
    }
}

const isHeartbeatStale = async (
    writeIntervalInMs: number,
    helper: AnnounceNodeToContractHelper
): Promise<boolean> => {
    logger.debug('Polling last heartbeat timestamp', {
        operatorContractAddress: helper.getOperatorContractAddress()
    })
    let lastHeartbeatTs
    try {
        lastHeartbeatTs = await helper.getTimestampOfLastHeartbeat()
    } catch (err) {
        logger.warn('Failed to poll last heartbeat timestamp', { reason: err?.message })
        return false // we don't know if heartbeat is stale, but we don't want execution to continue
    }
    const stale = lastHeartbeatTs !== undefined ? lastHeartbeatTs + writeIntervalInMs <= Date.now() : true
    logger.debug('Polled last heartbeat timestamp', { lastHeartbeatTs, stale })
    return stale
}

const writeHeartbeat = async (
    helper: AnnounceNodeToContractHelper,
    streamrClient: StreamrClient
): Promise<void> => {
    logger.info('Write heartbeat')
    try {
        const nodeDescriptor = await streamrClient.getPeerDescriptor()
        await helper.writeHeartbeat(nodeDescriptor)
        logger.debug('Wrote heartbeat', { nodeDescriptor })
    } catch (err) {
        logger.warn('Failed to write heartbeat', { reason: err?.message })
    }
}
