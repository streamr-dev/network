import { MessageLayer } from 'streamr-client-protocol'

const { StreamMessage } = MessageLayer
const { SIGNATURE_TYPES } = StreamMessage

import { ethers } from 'ethers'

const debug = require('debug')('StreamrClient::Signer')

export default class Signer {
    constructor(options = {}) {
        this.options = options
        if (this.options.privateKey) {
            const wallet = new ethers.Wallet(this.options.privateKey)
            this.address = wallet.address
            this.sign = (d) => wallet.signMessage(d)
        } else if (this.options.provider) {
            const provider = new ethers.providers.Web3Provider(this.options.provider)
            const signer = provider.getSigner()
            this.address = signer.address
            this.sign = async (d) => signer.signMessage(d)
        } else {
            throw new Error('Need either "privateKey" or "provider".')
        }
    }

    async signData(data, signatureType = SIGNATURE_TYPES.ETH) {
        if (signatureType === SIGNATURE_TYPES.ETH_LEGACY || signatureType === SIGNATURE_TYPES.ETH) {
            return this.sign(data)
        }
        throw new Error(`Unrecognized signature type: ${signatureType}`)
    }

    async signStreamMessage(streamMessage, signatureType = SIGNATURE_TYPES.ETH) {
        if (streamMessage.version !== 31) {
            throw new Error('Needs to be a StreamMessageV31')
        }
        if (!streamMessage.getTimestamp()) {
            throw new Error('Timestamp is required as part of the data to sign.')
        }
        const payload = Signer.getPayloadToSign(streamMessage, this.address, signatureType)
        /* eslint-disable no-param-reassign */
        streamMessage.signature = await this.signData(payload, signatureType)
        streamMessage.signatureType = signatureType
        streamMessage.messageId.publisherId = this.address
        /* eslint-enable no-param-reassign */
    }

    static getPayloadToSign(msg, address = msg.getPublisherId(), signatureType = SIGNATURE_TYPES.ETH) {
        if (signatureType === SIGNATURE_TYPES.ETH) {
            let prev = ''
            if (msg.prevMsgRef) {
                prev = `${msg.prevMsgRef.timestamp}${msg.prevMsgRef.sequenceNumber}`
            }
            return `${msg.getStreamId()}${msg.getStreamPartition()}${msg.getTimestamp()}${msg.messageId.sequenceNumber}` +
                `${address.toLowerCase()}${msg.messageId.msgChainId}${prev}${msg.getSerializedContent()}`
        } else if (signatureType === SIGNATURE_TYPES.ETH_LEGACY) {
            // verification of messages signed by old clients
            return `${msg.getStreamId()}${msg.getTimestamp()}${msg.getPublisherId().toLowerCase()}${msg.getSerializedContent()}`
        }
        throw new Error(`Unrecognized signature type: ${signatureType}`)
    }

    static verifySignature(data, signature, address, signatureType = SIGNATURE_TYPES.ETH) {
        if (signatureType === SIGNATURE_TYPES.ETH_LEGACY || signatureType === SIGNATURE_TYPES.ETH) {
            return ethers.utils.verifyMessage(data, signature).toLowerCase() === address.toLowerCase()
        }
        throw new Error(`Unrecognized signature type: ${signatureType}`)
    }

    static verifyStreamMessage(msg) {
        const payload = this.getPayloadToSign(msg, msg.getPublisherId(), msg.signatureType)
        const result = this.verifySignature(payload, msg.signature, msg.getPublisherId(), msg.signatureType)
        debug('verifyStreamMessage: pass: %o, message: %o', result, msg)
        return result
    }

    static createSigner(options, publishWithSignature) {
        if (publishWithSignature === 'never') {
            return undefined
        } else if (publishWithSignature === 'auto' && !options.privateKey && !options.provider) {
            return undefined
        } else if (publishWithSignature === 'auto' || publishWithSignature === 'always') {
            return new Signer(options)
        }
        throw new Error(`Unknown parameter value: ${publishWithSignature}`)
    }
}
