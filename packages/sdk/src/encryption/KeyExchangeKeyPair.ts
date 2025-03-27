import { AsymmetricEncryptionType } from "@streamr/trackerless-network/dist/generated/packages/trackerless-network/protos/NetworkRpc"
import { KeyLike } from "crypto"

export interface KeyExchangeKeyPair {
    getPublicKey(): KeyLike
    getPrivateKey(): KeyLike
    getEncryptionType(): AsymmetricEncryptionType
}