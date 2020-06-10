import StreamMessage from '../protocol/message_layer/StreamMessage'
import ValidationError from '../errors/ValidationError'

import SigningUtil from './SigningUtil'

const KEY_EXCHANGE_STREAM_PREFIX = 'SYSTEM/keyexchange/'

/**
 * Validates observed StreamMessages according to protocol rules, regardless of observer.
 * Functions needed for external interactions are injected as constructor args.
 *
 * The recoverAddressFn function could be imported from eg. ethers, but it would explode the bundle size, so
 * better leave it up to whoever is the end user of this class to choose which library they use.
 *
 * Note that most checks can not be performed for unsigned messages. Checking message integrity is impossible,
 * and checking permissions would require knowing the identity of the publisher, so it can't be done here.
 *
 * TODO later: support for unsigned messages can be removed when deprecated system-wide.
 */
export default class StreamMessageValidator {
    /**
     * @param getStream async function(streamId): returns the metadata required for stream validation for streamId.
     *        The included fields should be at least: { partitions, requireSignedData, requireEncryptedData }
     * @param isPublisher async function(address, streamId): returns true if address is a permitted publisher on streamId
     * @param isSubscriber async function(address, streamId): returns true if address is a permitted subscriber on streamId
     * @param verify async function(address, payload, signature): returns true if the address and payload match the signature.
     * The default implementation uses the native secp256k1 library on node.js and falls back to the elliptic library on browsers.
     */
    constructor({ getStream, isPublisher, isSubscriber, verify = SigningUtil.verify }) {
        StreamMessageValidator.checkInjectedFunctions(getStream, isPublisher, isSubscriber, verify)
        this.getStream = getStream
        this.isPublisher = isPublisher
        this.isSubscriber = isSubscriber
        this.verify = verify
    }

    static checkInjectedFunctions(getStreamFn, isPublisherFn, isSubscriberFn, verifyFn) {
        if (typeof getStreamFn !== 'function') {
            throw new Error('getStreamFn must be: async function(streamId): returns the validation metadata object for streamId')
        }
        if (typeof isPublisherFn !== 'function') {
            throw new Error('isPublisherFn must be: async function(address, streamId): returns true if address is a permitted publisher on streamId')
        }
        if (typeof isSubscriberFn !== 'function') {
            throw new Error('isSubscriberFn must be: async function(address, streamId): returns true if address is a permitted subscriber on streamId')
        }
        if (typeof verifyFn !== 'function') {
            throw new Error('verifyFn must be: function(address, payload, signature): returns true if the address and payload match the signature')
        }
    }

    /**
     * Checks that the given StreamMessage is satisfies the requirements of the protocol.
     * This includes checking permissions as well as signature. The method supports all
     * content types defined by the protocol.
     *
     * Resolves the promise if the message is valid, rejects otherwise.
     *
     * @param streamMessage the StreamMessage to validate.
     */
    async validate(streamMessage) {
        if (!streamMessage) {
            throw new ValidationError('Falsey argument passed to validate()!')
        }

        switch (streamMessage.contentType) {
            case StreamMessage.CONTENT_TYPES.MESSAGE:
                return this._validateMessage(streamMessage)
            case StreamMessage.CONTENT_TYPES.GROUP_KEY_REQUEST:
                return this._validateGroupKeyRequest(streamMessage)
            case StreamMessage.CONTENT_TYPES.GROUP_KEY_RESPONSE_SIMPLE:
            case StreamMessage.CONTENT_TYPES.GROUP_KEY_RESET_SIMPLE:
                return this._validateGroupKeyResponseOrReset(streamMessage)
            default:
                throw new ValidationError(`Unknown content type: ${streamMessage.contentType}!`)
        }
    }

    /**
     * Checks that the signature in the given StreamMessage is cryptographically valid.
     * Resolves if valid, rejects otherwise.
     *
     * It's left up to the user of this method to decide which implementation to pass in as the verifyFn.
     *
     * @param streamMessage the StreamMessage to validate.
     * @param verifyFn function(address, payload, signature): return true if the address and payload match the signature
     */
    static async assertSignatureIsValid(streamMessage, verifyFn) {
        const payload = streamMessage.getPayloadToSign()

        if (streamMessage.signatureType === StreamMessage.SIGNATURE_TYPES.ETH_LEGACY
            || streamMessage.signatureType === StreamMessage.SIGNATURE_TYPES.ETH) {
            let success
            try {
                success = await verifyFn(streamMessage.getPublisherId(), payload, streamMessage.signature)
            } catch (err) {
                throw new ValidationError(`An error occurred during address recovery from signature: ${err}`)
            }

            if (!success) {
                throw new ValidationError(`Signature validation failed for message: ${streamMessage.serialize()}`)
            }
        } else {
            // We should never end up here, as StreamMessage construction throws if the signature type is invalid
            throw new ValidationError(`Unrecognized signature type: ${streamMessage.signatureType}`)
        }
    }

    async _validateMessage(streamMessage) {
        const stream = await this.getStream(streamMessage.getStreamId())

        // Checks against stream metadata
        if (stream.requireSignedData && !streamMessage.signature) {
            throw new ValidationError(`This stream requires data to be signed. Message: ${streamMessage.serialize()}`)
        }
        if (stream.requireEncryptedData && streamMessage.encryptionType === StreamMessage.ENCRYPTION_TYPES.NONE) {
            throw new ValidationError(`This stream requires data to be encrypted. Message: ${streamMessage.serialize()}`)
        }
        if (streamMessage.getStreamPartition() < 0 || streamMessage.getStreamPartition() >= stream.partitions) {
            throw new ValidationError(`Partition ${streamMessage.getStreamPartition()} is out of range (0..${stream.partitions - 1}). Message: ${streamMessage.serialize()}`)
        }

        // Cryptographic integrity and publisher permission checks. Note that only signed messages can be validated this way.
        if (streamMessage.signature) {
            await StreamMessageValidator.assertSignatureIsValid(streamMessage, this.verify)
            const sender = streamMessage.getPublisherId()

            // Check that the sender of the message is a valid publisher of the stream
            const senderIsPublisher = await this.isPublisher(sender, streamMessage.getStreamId())
            if (!senderIsPublisher) {
                throw new ValidationError(`${sender} is not a publisher on stream ${streamMessage.getStreamId()}. Message: ${streamMessage.serialize()}`)
            }
        }
    }

    async _validateGroupKeyRequest(streamMessage) {
        if (!streamMessage.signature) {
            throw new ValidationError(`Received unsigned group key request (the public key must be signed to avoid MitM attacks). Message: ${streamMessage.serialize()}`)
        }
        if (!StreamMessageValidator.isKeyExchangeStream(streamMessage.getStreamId())) {
            throw new ValidationError(`Group key requests can only occur on stream ids of form ${`${KEY_EXCHANGE_STREAM_PREFIX}{address}`}. Message: ${streamMessage.serialize()}`)
        }

        const request = streamMessage.getParsedContent()
        const sender = streamMessage.getPublisherId()
        const recipient = streamMessage.getStreamId().substring(KEY_EXCHANGE_STREAM_PREFIX.length)

        await StreamMessageValidator.assertSignatureIsValid(streamMessage, this.verify)

        // Check that the recipient of the request is a valid publisher of the stream
        const recipientIsPublisher = await this.isPublisher(recipient, request.streamId)
        if (!recipientIsPublisher) {
            throw new ValidationError(`${recipient} is not a publisher on stream ${request.streamId}. Group key request: ${streamMessage.serialize()}`)
        }

        // Check that the sender of the request is a valid subscriber of the stream
        const senderIsSubscriber = await this.isSubscriber(sender, request.streamId)
        if (!senderIsSubscriber) {
            throw new ValidationError(`${sender} is not a subscriber on stream ${request.streamId}. Group key request: ${streamMessage.serialize()}`)
        }
    }

    async _validateGroupKeyResponseOrReset(streamMessage) {
        if (!streamMessage.signature) {
            throw new ValidationError(`Received unsigned group key response (it must be signed to avoid MitM attacks). Message: ${streamMessage.serialize()}`)
        }
        if (!StreamMessageValidator.isKeyExchangeStream(streamMessage.getStreamId())) {
            throw new ValidationError(`Group key responses can only occur on stream ids of form ${`${KEY_EXCHANGE_STREAM_PREFIX}{address}`}. Message: ${streamMessage.serialize()}`)
        }

        await StreamMessageValidator.assertSignatureIsValid(streamMessage, this.verify)

        const response = streamMessage.getParsedContent()
        const sender = streamMessage.getPublisherId()
        const recipient = streamMessage.getStreamId().substring(KEY_EXCHANGE_STREAM_PREFIX.length)

        // Check that the sender of the request is a valid publisher of the stream
        const senderIsPublisher = await this.isPublisher(sender, response.streamId)
        if (!senderIsPublisher) {
            throw new ValidationError(`${sender} is not a publisher on stream ${response.streamId}. Group key response: ${streamMessage.serialize()}`)
        }

        // Check that the recipient of the request is a valid subscriber of the stream
        const recipientIsSubscriber = await this.isSubscriber(recipient, response.streamId)
        if (!recipientIsSubscriber) {
            throw new ValidationError(`${recipient} is not a subscriber on stream ${response.streamId}. Group key response: ${streamMessage.serialize()}`)
        }
    }

    static isKeyExchangeStream(streamId) {
        return streamId.startsWith(KEY_EXCHANGE_STREAM_PREFIX)
    }
}
