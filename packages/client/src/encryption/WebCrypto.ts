import { Crypto as WebCrypto } from 'node-webcrypto-ossl'

export function getCryptoInstance(): Crypto {
    return new WebCrypto()
}
