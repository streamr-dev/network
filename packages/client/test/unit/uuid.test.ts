import { uuid } from '../../src/utils/uuid'

function extractCounterAtEndOfString(str: string): number | never {
    return parseInt(str.match(/\d+$/)![0])
}

describe('uuid', () => {
    it('generates different ids', () => {
        expect(uuid('test')).not.toEqual(uuid('test'))
    })
    it('includes text', () => {
        expect(uuid('test')).toContain('test')
    })
    it('increments', () => {
        const uid = uuid('test') // generate new text to ensure count starts at 1
        const firstValue = uuid(uid)
        const secondValue = uuid(uid)
        expect(extractCounterAtEndOfString(firstValue)).toBeLessThan(extractCounterAtEndOfString(secondValue))
    })
})
