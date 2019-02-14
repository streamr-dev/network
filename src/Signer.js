import { PublishRequest } from 'streamr-client-protocol'

const Web3 = require('web3')
const debug = require('debug')('StreamrClient::Signer')

const web3 = new Web3()

const SIGNATURE_TYPE_ETH = 1

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

    async signData(data, signatureType = SIGNATURE_TYPE_ETH) {
        if (signatureType === SIGNATURE_TYPE_ETH) {
            return this.sign(data)
        }
        throw new Error(`Unrecognized signature type: ${signatureType}`)
    }

    async getSignedPublishRequest(publishRequest, signatureType = SIGNATURE_TYPE_ETH) {
        const ts = publishRequest.getTimestampAsNumber()
        if (!ts) {
            throw new Error('Timestamp is required as part of the data to sign.')
        }
        const payload = Signer.getPayloadToSign(publishRequest.streamId, ts, this.address, publishRequest.getSerializedContent(), signatureType)
        const signature = await this.signData(payload, signatureType)
        return new PublishRequest(
            publishRequest.streamId,
            publishRequest.apiKey,
            publishRequest.sessionToken,
            publishRequest.content,
            publishRequest.timestamp,
            publishRequest.partitionKey,
            this.address,
            signatureType,
            signature,
        )
    }

    static getPayloadToSign(streamId, timestamp, publisherId, content, signatureType = SIGNATURE_TYPE_ETH) {
        if (signatureType === SIGNATURE_TYPE_ETH) {
            return `${streamId}${timestamp}${publisherId.toLowerCase()}${content}`
        }
        throw new Error(`Unrecognized signature type: ${signatureType}`)
    }

    static verifySignature(data, signature, address, signatureType = SIGNATURE_TYPE_ETH) {
        if (signatureType === SIGNATURE_TYPE_ETH) {
            return web3.eth.accounts.recover(data, signature).toLowerCase() === address.toLowerCase()
        }
        throw new Error(`Unrecognized signature type: ${signatureType}`)
    }

    static verifyStreamMessage(msg, trustedPublishers = new Set()) {
        const payload = this.getPayloadToSign(msg.streamId, msg.timestamp, msg.publisherAddress, msg.getSerializedContent())
        const result = this.verifySignature(payload, msg.signature, msg.publisherAddress, msg.signatureType)
            && trustedPublishers.has(msg.publisherAddress.toLowerCase())
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
