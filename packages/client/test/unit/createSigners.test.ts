import { createSigners } from '../../src/utils/createSigners'
import { Claim, Receipt, toStreamID } from 'streamr-client-protocol'
import { SignatureFunctions } from 'streamr-network'

const SENDER_PK = 'fbfb70ea3fc9a5ee125df648535175dc1fdd14443bf2b1fa9dd661253e06f77c'
const SENDER_ADDRESS = '0x8F19Eb1D0BF28c8aA28E5e50d81b7E59d5Aaa6eC'

const RECEIVER_PK = '55c9c8e62f18f16b0be13dda9b81177a2fef59bd47a1a747ee525c3fd21ce057'
const RECEIVER_ADDRESS = '0xccDd93065757e35CA932093d43c9d3D255ABEaa9'

const BASE_CLAIM: Readonly<Omit<Claim, 'signature' | 'sender' | 'receiver'>> = {
    streamId: toStreamID('stream'),
    streamPartition: 0,
    publisherId: '',
    msgChainId: '',
    windowNumber: 1,
    messageCount: 1,
    totalPayloadSize: 1
}

describe(createSigners, () => {
    it('returns undefined if not given private key', () => {
        expect(createSigners(undefined)).toEqual(undefined)
    })

    describe.each(['without', 'with'])('nodeId %s sessionId', (setting) => {
        let unsignedClaim: Readonly<Omit<Claim, 'signature'>>
        let claimSigner: SignatureFunctions<Claim>
        let receiptSigner: SignatureFunctions<Receipt>

        beforeEach(() => {
            claimSigner = createSigners(SENDER_PK).claim
            receiptSigner = createSigners(RECEIVER_PK).receipt
            unsignedClaim = Object.freeze({
                ...BASE_CLAIM,
                sender: SENDER_ADDRESS + (setting === 'without' ? '' : '#sessionId12345'),
                receiver: RECEIVER_ADDRESS + (setting === 'without' ? '' : '#sessionId98765')
            })
        })

        describe('claims', () => {
            it('claim can be signed', () => {
                const signature = claimSigner.sign(unsignedClaim)
                expect(signature.length).toBeGreaterThan(30)
            })

            it('valid claim passes validation', () => {
                const signature = claimSigner.sign(unsignedClaim)
                const valid = claimSigner.validate({
                    ...unsignedClaim,
                    signature
                })
                expect(valid).toEqual(true)
            })

            it('tampered claim signature fails validation', () => {
                const signature = claimSigner.sign(unsignedClaim) + 'fafa'
                const valid = claimSigner.validate({
                    ...unsignedClaim,
                    signature
                })
                expect(valid).toEqual(false)
            })

            it('tampered claim sender fails validation', () => {
                const signature = claimSigner.sign(unsignedClaim)
                const valid = claimSigner.validate({
                    ...unsignedClaim,
                    sender: '0xE8CB59d02cd806b50A0C8f3Bf878Ed797E664Aeb',
                    signature
                })
                expect(valid).toEqual(false)
            })
        })

        describe('receipts', () => {
            let claim: Claim

            beforeEach(() => {
                claim = {
                    ...unsignedClaim,
                    signature: claimSigner.sign(unsignedClaim)
                }
            })

            it('receipts can be signed', () => {
                const signature = receiptSigner.sign({ claim })
                expect(signature.length).toBeGreaterThan(30)
            })

            it('valid receipt passes validation', () => {
                const signature = receiptSigner.sign({ claim })
                const valid = receiptSigner.validate({
                    claim,
                    signature
                })
                expect(valid).toEqual(true)
            })

            it('tampered receipt signature fails validation', () => {
                const signature = receiptSigner.sign({ claim }) + 'abba'
                const valid = receiptSigner.validate({
                    claim,
                    signature
                })
                expect(valid).toEqual(false)
            })

            it('tampered claim receiver fails validation', () => {
                const signature = receiptSigner.sign({ claim })
                const valid = receiptSigner.validate({
                    claim: {
                        ...claim,
                        receiver: '0xd7800EC32De1308529deE609AD801D2D4BdC937E'
                    },
                    signature
                })
                expect(valid).toEqual(false)
            })

            it('tampered claim sender fails validation', () => {
                const signature = receiptSigner.sign({ claim })
                const valid = receiptSigner.validate({
                    claim: {
                        ...claim,
                        sender: '0xd7800EC32De1308529deE609AD801D2D4BdC937E'
                    },
                    signature
                })
                expect(valid).toEqual(false)
            })
        })
    })
})
