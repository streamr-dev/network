import { ml_kem1024 } from "@noble/post-quantum/ml-kem"
import { KeyExchangeKeyPair } from "./KeyExchangeKeyPair"
import { AsymmetricEncryptionType } from "@streamr/trackerless-network/dist/generated/packages/trackerless-network/protos/NetworkRpc"

export class MLKEMKeyPair implements KeyExchangeKeyPair {
    private readonly privateKey: Buffer
    private readonly publicKey: Buffer

    private constructor(privateKey: Buffer, publicKey: Buffer) {
        this.privateKey = privateKey
        this.publicKey = publicKey
    }

    getPublicKey(): Buffer {
        return this.publicKey
    }

    getPrivateKey(): Buffer {
        return this.privateKey
    }

    getEncryptionType(): AsymmetricEncryptionType {
        return AsymmetricEncryptionType.ML_KEM
    }

    static create(): MLKEMKeyPair {
        const keyPair = ml_kem1024.keygen()
        return new MLKEMKeyPair(Buffer.from(keyPair.secretKey), Buffer.from(keyPair.publicKey))
    }

}
