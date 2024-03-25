import { SignatureType, StreamMessage, StreamMessageError, StreamMessageType, } from '@streamr/protocol'
import { convertBytesToGroupKeyRequest, convertBytesToGroupKeyResponse } from '@streamr/trackerless-network'
import { EthereumAddress, verifySignature } from '@streamr/utils'
import { StreamRegistry } from '../contracts/StreamRegistry'
import { createSignaturePayload } from '../signature'
import { ERC1271ContractFacade } from '../contracts/ERC1271ContractFacade'

export const validateStreamMessage = async (
    msg: StreamMessage,
    streamRegistry: StreamRegistry,
    erc1271ContractFacade: ERC1271ContractFacade
): Promise<void> => {
    await doValidate(msg, streamRegistry, erc1271ContractFacade).catch((err: any) => {
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
    erc1271ContractFacade: ERC1271ContractFacade
): Promise<void> => {
    await assertSignatureIsValid(streamMessage, erc1271ContractFacade)
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
            throw new StreamMessageError(`Unknown message type: ${streamMessage.messageType}!`, streamMessage)
    }
}

/**
 * Checks that the signature in the given StreamMessage is cryptographically valid.
 * Resolves if valid, rejects otherwise.
 */
export const assertSignatureIsValid = async (streamMessage: StreamMessage, erc1271ContractFacade: ERC1271ContractFacade): Promise<void> => {
    const payload = createSignaturePayload({
        messageId: streamMessage.messageId,
        messageType: streamMessage.messageType,
        content: streamMessage.content,
        signatureType: streamMessage.signatureType,
        encryptionType: streamMessage.encryptionType,
        prevMsgRef: streamMessage.prevMsgRef ?? undefined,
        newGroupKey: streamMessage.newGroupKey ?? undefined
    })
    let success: boolean
    try {
        if (streamMessage.signatureType !== SignatureType.ERC_1271) {
            success = verifySignature(streamMessage.getPublisherId(), payload, streamMessage.signature)
        } else {
            success = await erc1271ContractFacade.isValidSignature(
                streamMessage.getPublisherId(),
                payload,
                streamMessage.signature
            )
        }
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
