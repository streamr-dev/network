import StreamMessage from '../protocol/message_layer/StreamMessage'
import ValidationError from '../errors/ValidationError'
import GroupKeyRequest from '../protocol/message_layer/GroupKeyRequest'
import GroupKeyMessage from '../protocol/message_layer/GroupKeyMessage'

import SigningUtil from './SigningUtil'

const KEY_EXCHANGE_STREAM_PREFIX = 'SYSTEM/keyexchange/'

export interface StreamMetadata {
    partitions: number,
    requireSignedData: boolean,
    requireEncryptedData: boolean
}

export interface Options {
    requireBrubeckValidation?: boolean

    getStream: (streamId: string) => Promise<StreamMetadata>
    isPublisher: (address: string, streamId: string) => Promise<boolean>
    isSubscriber: (address: string, streamId: string) => Promise<boolean>
    verify?: (address: string, payload: string, signature: string) => Promise<boolean>
}

const PUBLIC_USER = '0x0000000000000000000000000000000000000000'

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

    requireBrubeckValidation?: boolean

    getStream: (streamId: string) => Promise<StreamMetadata>
    isPublisher: (address: string, streamId: string) => Promise<boolean>
    isSubscriber: (address: string, streamId: string) => Promise<boolean>
    verify: (address: string, payload: string, signature: string) => Promise<boolean>

    /**
     * @param getStream async function(streamId): returns the metadata required for stream validation for streamId.
     *        The included fields should be at least: { partitions, requireSignedData, requireEncryptedData }
     * @param isPublisher async function(address, streamId): returns true if address is a permitted publisher on streamId
     * @param isSubscriber async function(address, streamId): returns true if address is a permitted subscriber on streamId
     * @param verify async function(address, payload, signature): returns true if the address and payload match the signature.
     * The default implementation uses the native secp256k1 library on node.js and falls back to the elliptic library on browsers.
     */
    constructor({ getStream, isPublisher, isSubscriber, verify = SigningUtil.verify, requireBrubeckValidation=false }: Options) {
        StreamMessageValidator.checkInjectedFunctions(getStream, isPublisher, isSubscriber, verify)
        this.getStream = getStream
        this.isPublisher = isPublisher
        this.isSubscriber = isSubscriber
        this.verify = verify

        this.requireBrubeckValidation = requireBrubeckValidation
    }

    static checkInjectedFunctions(
        getStream: (streamId: string) => Promise<StreamMetadata>,
        isPublisher: (address: string, streamId: string) => Promise<boolean>,
        isSubscriber: (address: string, streamId: string) => Promise<boolean>,
        verify: (address: string, payload: string, signature: string) => Promise<boolean>
    ) {
        if (typeof getStream !== 'function') {
            throw new Error('getStream must be: async function(streamId): returns the validation metadata object for streamId')
        }
        if (typeof isPublisher !== 'function') {
            throw new Error('isPublisher must be: async function(address, streamId): returns true if address is a permitted publisher on streamId')
        }
        if (typeof isSubscriber !== 'function') {
            throw new Error('isSubscriber must be: async function(address, streamId): returns true if address is a permitted subscriber on streamId')
        }
        if (typeof verify !== 'function') {
            throw new Error('verify must be: function(address, payload, signature): returns true if the address and payload match the signature')
        }
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
    async validate(streamMessage: StreamMessage) {
        if (!streamMessage) {
            throw new ValidationError('Falsey argument passed to validate()!')
        }

        switch (streamMessage.messageType) {
            case StreamMessage.MESSAGE_TYPES.MESSAGE:
                return this.validateMessage(streamMessage)
            case StreamMessage.MESSAGE_TYPES.GROUP_KEY_REQUEST:
                return this.validateGroupKeyRequest(streamMessage)
            case StreamMessage.MESSAGE_TYPES.GROUP_KEY_ANNOUNCE:
            case StreamMessage.MESSAGE_TYPES.GROUP_KEY_RESPONSE:
            case StreamMessage.MESSAGE_TYPES.GROUP_KEY_ERROR_RESPONSE:
                return this.validateGroupKeyResponseOrAnnounce(streamMessage)
            default:
                throw new ValidationError(`Unknown message type: ${streamMessage.messageType}!`)
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
    static async assertSignatureIsValid(
        streamMessage: StreamMessage,
        verifyFn: (address: string, payload: string, signature: string) => Promise<boolean>
    ) {
        const payload = streamMessage.getPayloadToSign()

        if (streamMessage.signatureType === StreamMessage.SIGNATURE_TYPES.ETH_LEGACY
            || streamMessage.signatureType === StreamMessage.SIGNATURE_TYPES.ETH) {
            let success
            try {
                success = await verifyFn(streamMessage.getPublisherId(), payload, streamMessage.signature!)
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

    private async validateMessage(streamMessage: StreamMessage) {
        const stream = await this.getStream(streamMessage.getStreamId())

        // Checks against stream metadata
        if ((stream.requireSignedData || this.requireBrubeckValidation) && !streamMessage.signature) {
            throw new ValidationError(`Stream data is required to be signed. Message: ${streamMessage.serialize()}`)
        }



        if (streamMessage.encryptionType === StreamMessage.ENCRYPTION_TYPES.NONE){
            if (stream.requireEncryptedData){
                throw new ValidationError(`Non-public streams require data to be encrypted. Message: ${streamMessage.serialize()}`)
            } else if (this.requireBrubeckValidation){
                const isPublicStream = await this.isSubscriber(PUBLIC_USER, streamMessage.getStreamId())
                if (!isPublicStream){
                    throw new ValidationError(`Non-public streams require data to be encrypted. Message: ${streamMessage.serialize()}`)
                }
            }
        }

        if (streamMessage.getStreamPartition() < 0 || streamMessage.getStreamPartition() >= stream.partitions) {
            throw new ValidationError(`Partition ${streamMessage.getStreamPartition()} is out of range (0..${stream.partitions - 1}). Message: ${streamMessage.serialize()}`)
        }

        if (streamMessage.signature) {
            // Cryptographic integrity and publisher permission checks. Note that only signed messages can be validated this way.
            await StreamMessageValidator.assertSignatureIsValid(streamMessage, this.verify)
            const sender = streamMessage.getPublisherId()
            // Check that the sender of the message is a valid publisher of the stream
            const senderIsPublisher = await this.isPublisher(sender, streamMessage.getStreamId())
            if (!senderIsPublisher) {
                throw new ValidationError(`${sender} is not a publisher on stream ${streamMessage.getStreamId()}. Message: ${streamMessage.serialize()}`)
            }
        }
    }

    private async validateGroupKeyRequest(streamMessage: StreamMessage) {
        if (!streamMessage.signature) {
            throw new ValidationError(`Received unsigned group key request (the public key must be signed to avoid MitM attacks). Message: ${streamMessage.serialize()}`)
        }
        if (!StreamMessageValidator.isKeyExchangeStream(streamMessage.getStreamId())) {
            throw new ValidationError(`Group key requests can only occur on stream ids of form ${`${KEY_EXCHANGE_STREAM_PREFIX}{address}`}. Message: ${streamMessage.serialize()}`)
        }

        const groupKeyRequest = GroupKeyRequest.fromStreamMessage(streamMessage)
        const sender = streamMessage.getPublisherId()
        const recipient = streamMessage.getStreamId().substring(KEY_EXCHANGE_STREAM_PREFIX.length)

        await StreamMessageValidator.assertSignatureIsValid(streamMessage, this.verify)

        // Check that the recipient of the request is a valid publisher of the stream
        const recipientIsPublisher = await this.isPublisher(recipient, groupKeyRequest.streamId)
        if (!recipientIsPublisher) {
            throw new ValidationError(`${recipient} is not a publisher on stream ${groupKeyRequest.streamId}. Group key request: ${streamMessage.serialize()}`)
        }

        // Check that the sender of the request is a valid subscriber of the stream
        const senderIsSubscriber = await this.isSubscriber(sender, groupKeyRequest.streamId)
        if (!senderIsSubscriber) {
            throw new ValidationError(`${sender} is not a subscriber on stream ${groupKeyRequest.streamId}. Group key request: ${streamMessage.serialize()}`)
        }
    }

    private async validateGroupKeyResponseOrAnnounce(streamMessage: StreamMessage) {
        if (!streamMessage.signature) {
            throw new ValidationError(`Received unsigned ${streamMessage.messageType} (it must be signed to avoid MitM attacks). Message: ${streamMessage.serialize()}`)
        }
        if (!StreamMessageValidator.isKeyExchangeStream(streamMessage.getStreamId())) {
            throw new ValidationError(`${streamMessage.messageType} can only occur on stream ids of form ${`${KEY_EXCHANGE_STREAM_PREFIX}{address}`}. Message: ${streamMessage.serialize()}`)
        }

        await StreamMessageValidator.assertSignatureIsValid(streamMessage, this.verify)

        const groupKeyMessage = GroupKeyMessage.fromStreamMessage(streamMessage) // can be GroupKeyResponse or GroupKeyAnnounce, only streamId is read
        const sender = streamMessage.getPublisherId()
        const recipient = streamMessage.getStreamId().substring(KEY_EXCHANGE_STREAM_PREFIX.length)

        // Check that the sender of the request is a valid publisher of the stream
        const senderIsPublisher = await this.isPublisher(sender, groupKeyMessage.streamId)
        if (!senderIsPublisher) {
            throw new ValidationError(`${sender} is not a publisher on stream ${groupKeyMessage.streamId}. ${streamMessage.messageType}: ${streamMessage.serialize()}`)
        }

        // Check that the recipient of the request is a valid subscriber of the stream
        const recipientIsSubscriber = await this.isSubscriber(recipient, groupKeyMessage.streamId)
        if (!recipientIsSubscriber) {
            throw new ValidationError(`${recipient} is not a subscriber on stream ${groupKeyMessage.streamId}. ${streamMessage.messageType}: ${streamMessage.serialize()}`)
        }
    }

    static isKeyExchangeStream(streamId: string) {
        return streamId.startsWith(KEY_EXCHANGE_STREAM_PREFIX)
    }
}
