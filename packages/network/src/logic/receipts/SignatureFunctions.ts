import crypto from 'crypto'
import { BaseClaim, Claim, Receipt } from 'streamr-client-protocol'

// Simplistic placeholder (dummy) functions for "cryptographically" "signing" messages
export const DUMMY_SIGNATURE_FUNCTIONS: SignatureFunctions = Object.freeze({
    requesterSign(baseClaim: BaseClaim): string {
        return crypto
            .createHash('md5')
            .update(JSON.stringify(baseClaim))
            .digest('hex')
    },
    validateClaim({ signature, ...baseClaim }: Claim): boolean {
        return DUMMY_SIGNATURE_FUNCTIONS.requesterSign(baseClaim) === signature
    },
    responderSign(claim: Claim): string {
        return crypto
            .createHash('md5')
            .update(JSON.stringify(claim))
            .digest('hex')
    },
    validateReceipt(receipt: Receipt): boolean {
        return DUMMY_SIGNATURE_FUNCTIONS.responderSign(receipt.claim) === receipt.claim.receiver
    }
})

export interface SignatureFunctions {
    requesterSign(claim: BaseClaim): string
    validateClaim(claim: Claim): boolean
    responderSign(claim: Claim): string
    validateReceipt(receipt: Receipt): boolean
}
