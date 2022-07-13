import { randomBytes } from 'crypto'
import * as NodeUtil  from '../../../src/utils/NodeUtil'

function randomAddress() {
    return `0x${randomBytes(32).toString('hex').slice(0, 40)}`
}
describe('NodeUtil', () => {
    describe('generateMnemonicFromAddress', () => {
        it('always returns same mnemonic for the same address', () => {
            const address = randomAddress()
            const result1 = NodeUtil.generateMnemonicFromAddress(address)
            const result2 = NodeUtil.generateMnemonicFromAddress(address)
            expect(result1).toEqual(result2)
            expect(result1).not.toEqual('') // is not empty
            expect(result1.trim()).toEqual(result1) // no whitespace
        })

        it('ignores address case', () => {
            const address = randomAddress()
            const result1 = NodeUtil.generateMnemonicFromAddress(address.toLowerCase())
            const result2 = NodeUtil.generateMnemonicFromAddress(address)
            expect(result1).toEqual(result2)
        })

        it('can append 0x if needed', () => {
            const address = randomAddress().slice(2)
            const result1 = NodeUtil.generateMnemonicFromAddress(address.toLowerCase())
            const result2 = NodeUtil.generateMnemonicFromAddress(address)
            expect(result1).toEqual(result2)
        })

        it('matches hardcoded value i.e. algorithm has not changed', () => {
            expect(NodeUtil.generateMnemonicFromAddress('0xC983de43c5d22186F1e051c6da419c5a17F19544')).toEqual('Sister Bus Movie')
        })
    })
})
