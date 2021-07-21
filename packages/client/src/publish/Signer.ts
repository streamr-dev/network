import { StreamMessageUnsigned, StreamMessageSigned, SignatureType, SigningUtil } from 'streamr-client-protocol'
import { Web3Provider } from '@ethersproject/providers'
import { Bytes } from '@ethersproject/bytes'

import { pLimitFn, sleep } from '../utils'
import type { AuthenticatedConfig } from '../Ethereum'

function getSigningFunction(options: AuthenticatedConfig) {
    if ('privateKey' in options && options.privateKey) {
        const { privateKey } = options
        const key = (typeof privateKey === 'string' && privateKey.startsWith('0x'))
            ? privateKey.slice(2) // strip leading 0x
            : privateKey
        return async (d: string) => SigningUtil.sign(d, key.toString())
    }

    if ('ethereum' in options && options.ethereum) {
        const { ethereum } = options
        const web3Provider = new Web3Provider(ethereum)
        const signer = web3Provider.getSigner()
        // sign one at a time & wait a moment before asking for next signature
        // otherwise metamask extension may not show the prompt window
        return pLimitFn(async (d: Bytes | string) => {
            const sig = await signer.signMessage(d)
            await sleep(50)
            return sig
        }, 1)
    }

    throw new Error('Need either "privateKey" or "ethereum".')
}

export default function Signer(authOptions: AuthenticatedConfig) {
    const sign = getSigningFunction(authOptions)

    async function signStreamMessage<T>(
        streamMessage: StreamMessageUnsigned<T>,
        signatureType: SignatureType = SignatureType.ETH
    ): Promise<StreamMessageSigned<T>> {
        if (!streamMessage) {
            throw new Error('streamMessage required as part of the data to sign.')
        }

        if (typeof streamMessage.getTimestamp !== 'function' || !streamMessage.getTimestamp()) {
            throw new Error('Timestamp is required as part of the data to sign.')
        }

        if (signatureType !== SignatureType.ETH_LEGACY && signatureType !== SignatureType.ETH) {
            throw new Error(`Unrecognized signature type: ${signatureType}`)
        }

        const signedMessage: StreamMessageSigned<T> = Object.assign(streamMessage, {
            signatureType,
            signature: await sign(streamMessage.getPayloadToSign(signatureType)),
        })

        return signedMessage
    }

    return Object.assign(signStreamMessage, {
        signData: sign, // this mainly for tests
    })
}
