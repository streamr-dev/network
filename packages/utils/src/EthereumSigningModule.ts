import secp256k1 from 'secp256k1'
import crypto from 'crypto'
import { createSignature, hash } from './signingUtils'
import { ISigningModule } from './ISigningModule';

export class EthereumSigningModule implements ISigningModule {

    private readonly privateKey: Uint8Array

    constructor(privateKey?: Uint8Array) {
        if (privateKey !== undefined) {
            this.privateKey = privateKey;
        } else {
            this.privateKey = this.generateRandomPrivateKey()
        }
    }
   
    public hash(data: Uint8Array): Uint8Array {
        return hash(data)
    }

    public sign(data: Uint8Array): Uint8Array {
        return createSignature(data, this.privateKey)
    }
    
    // eslint-disable-next-line class-methods-use-this
    private generateRandomPrivateKey(): Uint8Array {
        let privateKey: Uint8Array
        do {
            privateKey = crypto.randomBytes(32);
        } while (!secp256k1.privateKeyVerify(privateKey))
        return privateKey
    }
}
