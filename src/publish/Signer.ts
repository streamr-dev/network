import { MessageLayer, Utils } from 'streamr-client-protocol'
import { Web3Provider } from '@ethersproject/providers'

import { pLimitFn, sleep } from '../utils'
import type { EthereumConfig } from '../Config'

const { StreamMessage } = MessageLayer
const { SigningUtil } = Utils
const { SIGNATURE_TYPES } = StreamMessage

type AuthOption = {
    ethereum?: never
    privateKey: string | Uint8Array
} | {
    privateKey?: never
    ethereum: EthereumConfig
} | {
    ethereum?: never
    privateKey?: never
}

function getSigningFunction({
    privateKey,
    ethereum,
}: AuthOption) {
    if (privateKey) {
        const key = (typeof privateKey === 'string' && privateKey.startsWith('0x'))
            ? privateKey.slice(2) // strip leading 0x
            : privateKey
        return async (d: string) => SigningUtil.sign(d, key.toString())
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

export default function Signer(options: AuthOption, publishWithSignature = 'auto') {
    const { privateKey, ethereum } = options
    const noSignStreamMessage = (streamMessage: MessageLayer.StreamMessage) => streamMessage

    if (publishWithSignature === 'never') {
        return noSignStreamMessage
    }

    if (publishWithSignature === 'auto' && !privateKey && !ethereum) {
        return noSignStreamMessage
    }

    if (publishWithSignature !== 'auto' && publishWithSignature !== 'always') {
        throw new Error(`Unknown parameter value: ${publishWithSignature}`)
    }

    const sign = getSigningFunction(options)

    async function signStreamMessage(
        streamMessage: MessageLayer.StreamMessage,
        signatureType: MessageLayer.StreamMessage['signatureType'] = SIGNATURE_TYPES.ETH
    ) {
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
