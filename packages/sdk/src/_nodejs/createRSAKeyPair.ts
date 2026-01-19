import crypto from 'crypto'
import { promisify } from 'util'
import type { PemKeyPair } from '../encryption/types'

export async function createRSAKeyPair(keyLength: number): Promise<PemKeyPair> {
    const generateKeyPair = promisify(crypto.generateKeyPair)
    const { publicKey, privateKey } = await generateKeyPair('rsa', {
        modulusLength: keyLength,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem',
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem',
        },
    })

    return { privateKey, publicKey }
}
