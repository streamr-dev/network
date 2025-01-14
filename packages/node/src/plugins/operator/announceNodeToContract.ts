import { Operator, StreamrClient } from '@streamr/sdk'
import { Logger } from '@streamr/utils'

const logger = new Logger(module)

export const announceNodeToContract = async (
    writeIntervalInMs: number,
    operator: Operator,
    streamrClient: StreamrClient
): Promise<void> => {
    if (await isHeartbeatStale(writeIntervalInMs, operator)) {
        await writeHeartbeat(operator, streamrClient)
    }
}

const isHeartbeatStale = async (writeIntervalInMs: number, operator: Operator): Promise<boolean> => {
    logger.debug('Polling last heartbeat timestamp', {
        operatorContractAddress: await operator.getContractAddress()
    })
    let lastHeartbeatTs
    try {
        lastHeartbeatTs = await operator.getTimestampOfLastHeartbeat()
    } catch (err) {
        logger.warn('Failed to poll last heartbeat timestamp', { reason: err?.message })
        return false // we don't know if heartbeat is stale, but we don't want execution to continue
    }
    const stale = lastHeartbeatTs !== undefined ? lastHeartbeatTs + writeIntervalInMs <= Date.now() : true
    logger.debug('Polled last heartbeat timestamp', { lastHeartbeatTs, stale })
    return stale
}

const writeHeartbeat = async (operator: Operator, streamrClient: StreamrClient): Promise<void> => {
    logger.info('Write heartbeat')
    try {
        const nodeDescriptor = await streamrClient.getPeerDescriptor()
        await operator.writeHeartbeat(nodeDescriptor)
        logger.debug('Wrote heartbeat', { nodeDescriptor })
    } catch (err) {
        logger.warn('Failed to write heartbeat', { reason: err?.message })
    }
}
