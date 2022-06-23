import { uuid } from '../../src/utils/uuid'

describe('uuid', () => {
    it('generates different ids', () => {
        expect(uuid('test')).not.toEqual(uuid('test'))
    })
    it('includes text', () => {
        expect(uuid('test')).toContain('test')
    })
    it('increments', () => {
        const uid = uuid('test') // generate new text to ensure count starts at 1
        expect(uuid(uid) < uuid(uid)).toBeTruthy()
    })
})