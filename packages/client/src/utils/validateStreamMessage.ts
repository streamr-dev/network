import {
    GroupKeyMessage,
    StreamMessage,
    StreamMessageError,
    StreamMessageType,
    createSignaturePayload,
} from '@streamr/protocol'
import { EthereumAddress } from '@streamr/utils'
import { StreamRegistry } from '../registry/StreamRegistry'
import { verify } from '../utils/signingUtils'

export const validateStreamMessage = async (msg: StreamMessage, streamRegistry: StreamRegistry): Promise<void> => {
    await doValidate(msg, streamRegistry).catch((err: any) => {
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
const doValidate = (streamMessage: StreamMessage, streamRegistry: StreamRegistry): Promise<void> => {
    assertSignatureIsValid(streamMessage)
    switch (streamMessage.messageType) {
        case StreamMessageType.MESSAGE:
            return validateMessage(streamMessage, streamRegistry)
        case StreamMessageType.GROUP_KEY_REQUEST:
            return validateGroupKeyMessage(
                streamMessage,
                GroupKeyMessage.fromStreamMessage(streamMessage).recipient,
                streamMessage.getPublisherId(),
                streamRegistry
            )
        case StreamMessageType.GROUP_KEY_RESPONSE:
            return validateGroupKeyMessage(
                streamMessage,
                streamMessage.getPublisherId(),
                GroupKeyMessage.fromStreamMessage(streamMessage).recipient,
                streamRegistry
            )
        default:
            throw new StreamMessageError(`Unknown message type: ${streamMessage.messageType}!`, streamMessage)
    }
}

/**
 * Checks that the signature in the given StreamMessage is cryptographically valid.
 * Resolves if valid, rejects otherwise.
 *
 * @param streamMessage the StreamMessage to validate.
 */
const assertSignatureIsValid = (streamMessage: StreamMessage): void => {
    const payload = createSignaturePayload({
        messageId: streamMessage.getMessageID(),
        serializedContent: streamMessage.getSerializedContent(),
        prevMsgRef: streamMessage.prevMsgRef ?? undefined,
        newGroupKey: streamMessage.newGroupKey ?? undefined
    })
    let success
    try {
        success = verify(streamMessage.getPublisherId(), payload, streamMessage.signature)
    } catch (err) {
        throw new StreamMessageError(`An error occurred during address recovery from signature: ${err}`, streamMessage)
    }
    if (!success) {
        throw new StreamMessageError('Signature validation failed', streamMessage)
    }
}

const validateMessage = async (
    streamMessage: StreamMessage,
    streamRegistry: StreamRegistry
): Promise<void> => {
    const streamId = streamMessage.getStreamId()
    const stream = await streamRegistry.getStream(streamId)
    const partitionCount = stream.getMetadata().partitions
    if (streamMessage.getStreamPartition() < 0 || streamMessage.getStreamPartition() >= partitionCount) {
        throw new StreamMessageError(`Partition ${streamMessage.getStreamPartition()} is out of range (0..${partitionCount - 1})`, streamMessage)
    }
    const sender = streamMessage.getPublisherId()
    const isPublisher = await streamRegistry.isStreamPublisher(streamId, sender)
    if (!isPublisher) {
        throw new StreamMessageError(`${sender} is not a publisher on stream ${streamId}`, streamMessage)
    }
}

const validateGroupKeyMessage = async (
    streamMessage: StreamMessage,
    expectedPublisher: EthereumAddress,
    expectedSubscriber: EthereumAddress,
    streamRegistry: StreamRegistry
): Promise<void> => {
    const streamId = streamMessage.getStreamId()
    const isPublisher = await streamRegistry.isStreamPublisher(streamId, expectedPublisher)
    if (!isPublisher) {
        throw new StreamMessageError(`${expectedPublisher} is not a publisher on stream ${streamId}`, streamMessage)
    }
    const isSubscriber = await streamRegistry.isStreamSubscriber(streamId, expectedSubscriber)
    if (!isSubscriber) {
        throw new StreamMessageError(`${expectedSubscriber} is not a subscriber on stream ${streamId}`, streamMessage)
    }
}
