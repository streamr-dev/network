import crypto from 'crypto'
import { Claim, Receipt } from 'streamr-client-protocol'

// Simplistic placeholder (dummy) functions for "cryptographically" "signing" messages
export const DUMMY_SIGNATURE_FUNCTIONS: Signers = Object.freeze({
    claim: {
        sign(claim: Omit<Claim, 'signature'>) {
            return crypto
                .createHash('md5')
                .update(JSON.stringify(claim))
                .digest('hex')
        },
        validate({ signature, ...rest }: Claim)  {
            return DUMMY_SIGNATURE_FUNCTIONS.claim.sign(rest) === signature
        }
    },
    receipt: {
        sign(receipt: Omit<Receipt, 'signature'>) {
            return crypto
                .createHash('md5')
                .update(JSON.stringify(receipt))
                .digest('hex')
        },
        validate({ signature, ...rest }: Receipt) {
            return DUMMY_SIGNATURE_FUNCTIONS.receipt.sign(rest) === signature
        }
    }
})

export interface SignatureFunctions<T extends { signature: string }> {
    sign(item: Omit<T, 'signature'>): string
    validate(item: T): boolean
}

export interface Signers {
    claim: SignatureFunctions<Claim>,
    receipt: SignatureFunctions<Receipt>
}
