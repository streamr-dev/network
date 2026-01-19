import { randomBytes } from '@noble/post-quantum/utils'
import { GroupKey } from '../../src/encryption/GroupKey'

describe('GroupKey', () => {

    describe('constructor', () => {

        it('does not throw with valid values', () => {
            new GroupKey('mockId', Buffer.from('aB123456789012345678901234567890'))
        })

        it('throws if key is the wrong size', () => {
            expect(() => {
                new GroupKey('test', Buffer.from(randomBytes(16)))
            }).toThrow('size')
        })

        it('throws if key is not a buffer', () => {
            expect(() => {
                // @ts-expect-error expected error below is desirable, show typecheks working as intended
                new GroupKey('test', Array.from(randomBytes(32)))
            }).toThrow('Buffer')
        })
    })
})
