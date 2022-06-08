import crypto from 'crypto'
import { GroupKey } from '../../src/encryption/GroupKey'

describe('GroupKey.validate', () => {

    describe('validate', () => {
        it('throws if key is the wrong size', () => {
            expect(() => {
                GroupKey.validate(GroupKey.from(['test', crypto.randomBytes(16)]))
            }).toThrow('size')
        })
    
        it('throws if key is not a buffer', () => {
            expect(() => {
                // @ts-expect-error expected error below is desirable, show typecheks working as intended
                GroupKey.validate(GroupKey.from(['test', Array.from(crypto.randomBytes(32))]))
            }).toThrow('Buffer')
        })
    
        it('does not throw with valid values', () => {
            GroupKey.validate(GroupKey.generate())
        })
    
    })
})
