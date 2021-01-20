import { MessageLayer, Utils } from 'streamr-client-protocol'
import { Web3Provider } from '@ethersproject/providers'

import { pLimitFn, sleep } from '../utils'

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
        // sign one at a time & wait a moment before asking for next signature
        // otherwise metamask extension may not show the prompt window
        return pLimitFn(async (d) => {
            const sig = await signer.signMessage(d)
            await sleep(50)
            return sig
        }, 1)
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
        const signature = await sign(streamMessage.getPayloadToSign())
        return Object.assign(streamMessage, {
            signature,
        })
    }

    return Object.assign(signStreamMessage, {
        signData: sign, // this mainly for tests
    })
}
