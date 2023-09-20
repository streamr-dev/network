import { toStreamID } from '@streamr/protocol'
import { EthereumAddress, Logger } from '@streamr/utils'
import { StreamrClient } from 'streamr-client'
import { createHeartbeatMessage } from './heartbeatUtils'

const logger = new Logger(module)

export const announceNodeToStream = async (
    operatorContractAddress: EthereumAddress,
    streamrClient: StreamrClient
): Promise<void> => {
    const coordinationStream = toStreamID('/operator/coordination', operatorContractAddress)
    try {
        const peerDescriptor = await streamrClient.getPeerDescriptor()
        await streamrClient.publish(coordinationStream, createHeartbeatMessage(peerDescriptor))
        logger.debug('Published heartbeat to coordination stream', {
            streamId: coordinationStream
        })
    } catch (err) {
        logger.warn('Unable to publish to coordination stream', {
            streamId: coordinationStream,
            reason: err?.message
        })
    }
}
