import { toENSName } from '../src/ENSName'

describe('toENSName', () => {
    it.each(['noperiod', '.domain'])('throws on invalid ENS name "%s"', (str) => {
        expect(() => toENSName(str)).toThrow()
    })

    it('does not throw on valid ENS name', () => {
        expect(() => toENSName('valid.eth')).not.toThrow()
    })

    it('returned ENS name is in lowercase', () => {
        expect(toENSName('VALID.eTh')).toEqual('valid.eth')
    })
})
