import { MessageLayer } from 'streamr-client-protocol'

const { StreamMessage } = MessageLayer
const { SIGNATURE_TYPES } = StreamMessage

import Web3 from 'web3'
import FakeProvider from 'web3-fake-provider'

const debug = require('debug')('StreamrClient::Signer')

const web3 = new Web3(new FakeProvider())

export default class Signer {
    constructor(options = {}) {
        this.options = options
        if (this.options.privateKey) {
            const account = web3.eth.accounts.privateKeyToAccount(this.options.privateKey)
            this.address = account.address.toLowerCase()
            this.sign = (d) => account.sign(d).signature
        } else if (this.options.provider) {
            this.sign = async (d) => {
                const w3 = new Web3(this.options.provider)
                const accounts = await w3.eth.getAccounts()
                const address = accounts[0]
                if (!address) {
                    throw new Error('Cannot access account from provider')
                }
                this.address = address
                return w3.eth.personal.sign(d, this.address)
            }
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
        if (streamMessage.version !== 30) {
            throw new Error('Needs to be a StreamMessageV30')
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
            return `${msg.getStreamId()}${msg.getStreamPartition()}${msg.getTimestamp()}${msg.messageId.sequenceNumber}` +
                `${address.toLowerCase()}${msg.messageId.msgChainId}${msg.getSerializedContent()}`
        } else if (signatureType === SIGNATURE_TYPES.ETH_LEGACY) {
            // verification of messages signed by old clients
            return `${msg.getStreamId()}${msg.getTimestamp()}${msg.getPublisherId().toLowerCase()}${msg.getSerializedContent()}`
        }
        throw new Error(`Unrecognized signature type: ${signatureType}`)
    }

    static verifySignature(data, signature, address, signatureType = SIGNATURE_TYPES.ETH) {
        if (signatureType === SIGNATURE_TYPES.ETH_LEGACY || signatureType === SIGNATURE_TYPES.ETH) {
            return web3.eth.accounts.recover(data, signature).toLowerCase() === address.toLowerCase()
        }
        throw new Error(`Unrecognized signature type: ${signatureType}`)
    }

    static verifyStreamMessage(msg, trustedPublishers = new Set()) {
        const payload = this.getPayloadToSign(msg, msg.getPublisherId(), msg.signatureType)
        const result = this.verifySignature(payload, msg.signature, msg.getPublisherId(), msg.signatureType)
            && trustedPublishers.has(msg.getPublisherId().toLowerCase())
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
