import { Signers } from 'streamr-network'
import { Claim, Receipt } from 'streamr-client-protocol'
import { sign, verify } from './signingUtils'
import { getEthereumAddressFromNodeId } from './utils'

export function createSigners(privateKey: undefined): undefined
export function createSigners(privateKey: string): Signers
export function createSigners(privateKey: string | undefined): Signers | undefined {
    if (privateKey === undefined) {
        return undefined
    }
    return {
        claim: {
            sign(claim: Omit<Claim, 'signature'>): string {
                return sign(JSON.stringify(claim), privateKey)
            },
            validate({ signature, ...claim }: Claim): boolean {
                return verify(
                    getEthereumAddressFromNodeId(claim.sender),
                    JSON.stringify(claim),
                    signature
                )
            }
        },
        receipt: {
            sign(receipt: Omit<Receipt, 'signature'>): string {
                return sign(JSON.stringify(receipt), privateKey)
            },
            validate({ signature, ...receipt }: Receipt): boolean {
                return verify(
                    getEthereumAddressFromNodeId(receipt.claim.receiver),
                    JSON.stringify(receipt),
                    signature
                )
            }
        }
    }
}
