import {
    GroupKeyMessage,
    GroupKeyRequest,
    StreamMessage,
    StreamMessageError,
    StreamMessageType,
    createSignaturePayload,
} from '@streamr/protocol'
import { StreamRegistryCached } from './registry/StreamRegistryCached'
import { verify } from './utils/signingUtils'

export class Validator {
    private readonly streamRegistryCached: StreamRegistryCached

    constructor(streamRegistryCached: StreamRegistryCached) {
        this.streamRegistryCached = streamRegistryCached
    }

    async validate(msg: StreamMessage): Promise<void> {
        await this.doValidate(msg).catch((err: any) => {
            // all StreamMessageError already have this streamMessage, maybe this is 
            // here if e.g. contract call fails? TODO is this really needed as
            // the onError callback in subscribePipeline knows which message
            // it is handling?
            if (!err.streamMessage) {
                err.streamMessage = msg
            }
            throw err
        })
    }

    /**
     * Checks that the given StreamMessage is satisfies the requirements of the protocol.
     * This includes checking permissions as well as signature. The method supports all
     * message types defined by the protocol.
     *
     * Resolves the promise if the message is valid, rejects otherwise.
     *
     * @param streamMessage the StreamMessage to validate.
     */
    private async doValidate(streamMessage: StreamMessage): Promise<void> {
        this.assertSignatureIsValid(streamMessage)
        switch (streamMessage.messageType) {
            case StreamMessageType.MESSAGE:
                return this.validateMessage(streamMessage)
            case StreamMessageType.GROUP_KEY_REQUEST:
                return this.validateGroupKeyRequest(streamMessage)
            case StreamMessageType.GROUP_KEY_RESPONSE:
                return this.validateGroupKeyResponse(streamMessage)
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
    // eslint-disable-next-line class-methods-use-this
    private assertSignatureIsValid(streamMessage: StreamMessage): void {
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

    private async validateMessage(streamMessage: StreamMessage): Promise<void> {
        const stream = await this.streamRegistryCached.getStream(streamMessage.getStreamId())
        const partitionCount = stream.getMetadata().partitions

        if (streamMessage.getStreamPartition() < 0 || streamMessage.getStreamPartition() >= partitionCount) {
            throw new StreamMessageError(
                `Partition ${streamMessage.getStreamPartition()} is out of range (0..${partitionCount - 1})`,
                streamMessage
            )
        }

        const sender = streamMessage.getPublisherId()
        // Check that the sender of the message is a valid publisher of the stream
        const senderIsPublisher = await this.streamRegistryCached.isStreamPublisher(streamMessage.getStreamId(), sender)
        if (!senderIsPublisher) {
            throw new StreamMessageError(`${sender} is not a publisher on stream ${streamMessage.getStreamId()}.`, streamMessage)
        }
    }

    private async validateGroupKeyRequest(streamMessage: StreamMessage): Promise<void> {
        const groupKeyRequest = GroupKeyRequest.fromStreamMessage(streamMessage)
        const sender = streamMessage.getPublisherId()
        const streamId = streamMessage.getStreamId()
        const recipient = groupKeyRequest.recipient

        // Check that the recipient of the request is a valid publisher of the stream
        const recipientIsPublisher = await this.streamRegistryCached.isStreamPublisher(streamId, recipient)
        if (!recipientIsPublisher) {
            throw new StreamMessageError(`${recipient} is not a publisher on stream ${streamId}.`, streamMessage)
        }

        // Check that the sender of the request is a valid subscriber of the stream
        const senderIsSubscriber = await this.streamRegistryCached.isStreamSubscriber(streamId, sender)
        if (!senderIsSubscriber) {
            throw new StreamMessageError(`${sender} is not a subscriber on stream ${streamId}.`, streamMessage)
        }
    }

    private async validateGroupKeyResponse(streamMessage: StreamMessage): Promise<void> {
        const groupKeyMessage = GroupKeyMessage.fromStreamMessage(streamMessage) // only streamId is read
        const sender = streamMessage.getPublisherId()
        const streamId = streamMessage.getStreamId()
        const recipient = groupKeyMessage.recipient

        // Check that the sender of the request is a valid publisher of the stream
        const senderIsPublisher = await this.streamRegistryCached.isStreamPublisher(streamId, sender)
        if (!senderIsPublisher) {
            throw new StreamMessageError(
                `${sender} is not a publisher on stream ${streamId}. ${streamMessage.messageType}`,
                streamMessage
            )
        }

        // permit publishers to send error responses to invalid subscribers
        // Check that the recipient of the request is a valid subscriber of the stream
        const recipientIsSubscriber = await this.streamRegistryCached.isStreamSubscriber(streamId, recipient)
        if (!recipientIsSubscriber) {
            throw new StreamMessageError(
                `${recipient} is not a subscriber on stream ${streamId}. ${streamMessage.messageType}`,
                streamMessage
            )
        }
    }
}
