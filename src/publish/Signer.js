import { MessageLayer, Utils } from 'streamr-client-protocol'
import { Web3Provider } from '@ethersproject/providers'

const { StreamMessage } = MessageLayer
const { SigningUtil } = Utils
const { SIGNATURE_TYPES } = StreamMessage

function getSigningFunction({ privateKey, ethereum } = {}) {
    if (privateKey) {
        const key = (typeof privateKey === 'string' && privateKey.startsWith('0x'))
            ? privateKey.slice(2) // strip leading 0x
            : privateKey
        return async (d) => SigningUtil.sign(d, key)
    }

    if (ethereum) {
        const web3Provider = new Web3Provider(ethereum)
        const signer = web3Provider.getSigner()
        return async (d) => signer.signMessage(d)
    }

    throw new Error('Need either "privateKey" or "ethereum".')
}

export default function Signer(options = {}, publishWithSignature = 'auto') {
    const { privateKey, ethereum } = options

    if (publishWithSignature === 'never') {
        return (v) => v
    }

    if (publishWithSignature === 'auto' && !privateKey && !ethereum) {
        return (v) => v
    }

    if (publishWithSignature !== 'auto' && publishWithSignature !== 'always') {
        throw new Error(`Unknown parameter value: ${publishWithSignature}`)
    }

    const sign = getSigningFunction(options)

    async function signStreamMessage(streamMessage, signatureType = SIGNATURE_TYPES.ETH) {
        if (!streamMessage) {
            throw new Error('streamMessage required as part of the data to sign.')
        }

        if (typeof streamMessage.getTimestamp !== 'function' || !streamMessage.getTimestamp()) {
            throw new Error('Timestamp is required as part of the data to sign.')
        }

        if (signatureType !== SIGNATURE_TYPES.ETH_LEGACY && signatureType !== SIGNATURE_TYPES.ETH) {
            throw new Error(`Unrecognized signature type: ${signatureType}`)
        }

        // set signature so getting of payload works correctly
        // (publisherId should already be set)
        streamMessage.signatureType = signatureType // eslint-disable-line no-param-reassign
        return Object.assign(streamMessage, {
            signature: await sign(streamMessage.getPayloadToSign()),
        })
    }

    return Object.assign(signStreamMessage, {
        signData: sign, // this mainly for tests
    })
}
