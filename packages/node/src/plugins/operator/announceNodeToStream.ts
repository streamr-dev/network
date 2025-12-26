import { EthereumAddress, Logger } from '@streamr/utils'
import { StreamrClient } from '@streamr/sdk'
import { createHeartbeatMessage } from './heartbeatUtils'
import { formCoordinationStreamId } from './formCoordinationStreamId'
import { StrictConfig } from '../../config/config'

const logger = new Logger('announceNodeToStream')

export const announceNodeToStream = async (
    operatorContractAddress: EthereumAddress,
    streamrClient: StreamrClient,
    brokerConfig: Pick<StrictConfig, 'plugins'>
): Promise<void> => {
    const coordinationStream = formCoordinationStreamId(operatorContractAddress)
    try {
        const peerDescriptor = await streamrClient.getPeerDescriptor()
        await streamrClient.publish(coordinationStream, createHeartbeatMessage(peerDescriptor, brokerConfig))
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
