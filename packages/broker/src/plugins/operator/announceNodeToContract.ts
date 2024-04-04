import { Logger } from '@streamr/utils'
import StreamrClient from '@streamr/sdk'
import { ContractFacade } from './ContractFacade'

const logger = new Logger(module)

export const announceNodeToContract = async (
    writeIntervalInMs: number,
    contractFacade: ContractFacade,
    streamrClient: StreamrClient
): Promise<void> => {
    if (await isHeartbeatStale(writeIntervalInMs, contractFacade)) {
        await writeHeartbeat(contractFacade, streamrClient)
    }
}

const isHeartbeatStale = async (
    writeIntervalInMs: number,
    contractFacade: ContractFacade
): Promise<boolean> => {
    logger.debug('Polling last heartbeat timestamp', {
        operatorContractAddress: contractFacade.getOperatorContractAddress()
    })
    let lastHeartbeatTs
    try {
        lastHeartbeatTs = await contractFacade.getTimestampOfLastHeartbeat()
    } catch (err) {
        logger.warn('Failed to poll last heartbeat timestamp', { reason: err?.message })
        return false // we don't know if heartbeat is stale, but we don't want execution to continue
    }
    const stale = lastHeartbeatTs !== undefined ? lastHeartbeatTs + writeIntervalInMs <= Date.now() : true
    logger.debug('Polled last heartbeat timestamp', { lastHeartbeatTs, stale })
    return stale
}

const writeHeartbeat = async (
    contractFacade: ContractFacade,
    streamrClient: StreamrClient
): Promise<void> => {
    logger.info('Write heartbeat')
    try {
        const nodeDescriptor = await streamrClient.getPeerDescriptor()
        await contractFacade.writeHeartbeat(nodeDescriptor)
        logger.debug('Wrote heartbeat', { nodeDescriptor })
    } catch (err) {
        logger.warn('Failed to write heartbeat', { reason: err?.message })
    }
}
