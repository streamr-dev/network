import crypto from 'crypto'
import { GroupKey } from '../../src/encryption/GroupKey'

describe('GroupKey', () => {

    describe('constructor', () => {
        it('throws if key is the wrong size', () => {
            expect(() => {
                new GroupKey('test', crypto.randomBytes(16))
            }).toThrow('size')
        })

        it('throws if key is not a buffer', () => {
            expect(() => {
                // @ts-expect-error expected error below is desirable, show typecheks working as intended
                new GroupKey('test', Array.from(crypto.randomBytes(32)))
            }).toThrow('Buffer')
        })
    })

    describe('validate', () => {
        it('does not throw with valid values', () => {
            GroupKey.validate(GroupKey.generate())
        })
    })
})
