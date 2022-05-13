import crypto from 'crypto'
import { Claim } from 'streamr-client-protocol'

// Simplistic placeholder (dummy) functions for "cryptographically" "signing" messages
export const DUMMY_SIGNATURE_FUNCTIONS: SignatureFunctions = Object.freeze({
    signClaim(claim: Claim): string {
        return crypto
            .createHash('md5')
            .update(JSON.stringify(claim))
            .digest('hex')
    },
    validateClaim(claim: Claim, senderSignature: string): boolean {
        return DUMMY_SIGNATURE_FUNCTIONS.signClaim(claim) === senderSignature
    },
    signSignedClaim(claim: Claim, senderSignature: string): string {
        return crypto
            .createHash('md5')
            .update(JSON.stringify([claim, senderSignature]))
            .digest('hex')
    },
    validatedSignedClaim(claim: Claim, senderSignature: string, receiverSignature: string): boolean {
        return DUMMY_SIGNATURE_FUNCTIONS.signSignedClaim(claim, senderSignature) === receiverSignature
    }
})

export interface SignatureFunctions {
    signClaim(claim: Claim): string
    validateClaim(claim: Claim, senderSignature: string): boolean
    signSignedClaim(claim: Claim, senderSignature: string): string
    validatedSignedClaim(claim: Claim, senderSignature: string, receiverSignature: string): boolean
}
