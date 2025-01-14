import { UserID } from '@streamr/utils'
import { StreamRegistry } from '../contracts/StreamRegistry'
import { convertBytesToGroupKeyRequest, convertBytesToGroupKeyResponse } from '../protocol/oldStreamMessageBinaryUtils'
import { StreamMessage, StreamMessageType } from '../protocol/StreamMessage'
import { SignatureValidator } from '../signature/SignatureValidator'
import { getPartitionCount } from '../StreamMetadata'
import { StreamrClientError } from '../StreamrClientError'

export const validateStreamMessage = async (
    msg: StreamMessage,
    streamRegistry: StreamRegistry,
    signatureValidator: SignatureValidator
): Promise<void> => {
    await doValidate(msg, streamRegistry, signatureValidator).catch((err: any) => {
        // all StreamMessageError already have this streamMessage, maybe this is
        // here if e.g. contract call fails? TODO is this really needed as
        // the onError callback in messagePipeline knows which message
        // it is handling?
        if (!err.streamMessage) {
            err.streamMessage = msg
        }
        throw err
    })
}

/**
 * Checks that the given StreamMessage satisfies the requirements of the protocol.
 * This includes checking permissions as well as signature. The method supports all
 * message types defined by the protocol.
 *
 * Resolves the promise if the message is valid, rejects otherwise.
 *
 * @param streamMessage the StreamMessage to validate.
 */
const doValidate = async (
    streamMessage: StreamMessage,
    streamRegistry: StreamRegistry,
    signatureValidator: SignatureValidator
): Promise<void> => {
    await signatureValidator.assertSignatureIsValid(streamMessage)
    switch (streamMessage.messageType) {
        case StreamMessageType.MESSAGE:
            return validateMessage(streamMessage, streamRegistry)
        case StreamMessageType.GROUP_KEY_REQUEST:
            return validateGroupKeyMessage(
                streamMessage,
                convertBytesToGroupKeyRequest(streamMessage.content).recipient,
                streamMessage.getPublisherId(),
                streamRegistry
            )
        case StreamMessageType.GROUP_KEY_RESPONSE:
            return validateGroupKeyMessage(
                streamMessage,
                streamMessage.getPublisherId(),
                convertBytesToGroupKeyResponse(streamMessage.content).recipient,
                streamRegistry
            )
        default:
            throw new StreamrClientError(
                `Unknown message type: ${streamMessage.messageType}!`,
                'ASSERTION_FAILED',
                streamMessage
            )
    }
}

const validateMessage = async (streamMessage: StreamMessage, streamRegistry: StreamRegistry): Promise<void> => {
    const streamId = streamMessage.getStreamId()
    const streamMetadata = await streamRegistry.getStreamMetadata(streamId)
    const partitionCount = getPartitionCount(streamMetadata)
    if (streamMessage.getStreamPartition() < 0 || streamMessage.getStreamPartition() >= partitionCount) {
        throw new StreamrClientError(
            `Partition ${streamMessage.getStreamPartition()} is out of range (0..${partitionCount - 1})`,
            'INVALID_PARTITION',
            streamMessage
        )
    }
    const sender = streamMessage.getPublisherId()
    const isPublisher = await streamRegistry.isStreamPublisher(streamId, sender)
    if (!isPublisher) {
        throw new StreamrClientError(
            `${sender} is not a publisher on stream ${streamId}`,
            'MISSING_PERMISSION',
            streamMessage
        )
    }
}

const validateGroupKeyMessage = async (
    streamMessage: StreamMessage,
    expectedPublisherId: UserID,
    expectedSubscriberId: UserID,
    streamRegistry: StreamRegistry
): Promise<void> => {
    const streamId = streamMessage.getStreamId()
    const isPublisher = await streamRegistry.isStreamPublisher(streamId, expectedPublisherId)
    if (!isPublisher) {
        throw new StreamrClientError(
            `${expectedPublisherId} is not a publisher on stream ${streamId}`,
            'MISSING_PERMISSION',
            streamMessage
        )
    }
    const isSubscriber = await streamRegistry.isStreamSubscriber(streamId, expectedSubscriberId)
    if (!isSubscriber) {
        throw new StreamrClientError(
            `${expectedSubscriberId} is not a subscriber on stream ${streamId}`,
            'MISSING_PERMISSION',
            streamMessage
        )
    }
}
