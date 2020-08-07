import crypto from 'crypto'

import KeyStorageUtil from '../../src/KeyStorageUtil'

describe.skip('LatestKeyStorageUtil', () => {
    describe('hasKey()', () => {
        it('returns true iff there is a GroupKeyHistory for the stream', () => {
            const util = KeyStorageUtil.getKeyStorageUtil({
                streamId: {
                    groupKey: crypto.randomBytes(32),
                    start: Date.now()
                }
            }, false)
            expect(util.hasKey('streamId')).toBe(true)
            expect(util.hasKey('wrong-streamId')).toBe(false)
        })
    })

    describe('addKey()', () => {
        it('throws if adding an older key', () => {
            const util = KeyStorageUtil.getKeyStorageUtil({
                streamId: {
                    groupKey: crypto.randomBytes(32),
                    start: Date.now()
                }
            }, false)
            expect(() => {
                util.addKey('streamId', crypto.randomBytes(32), 0)
            }).toThrow()
        })
    })

    describe('getLatestKey()', () => {
        it('returns undefined if no key', () => {
            const util = KeyStorageUtil.getKeyStorageUtil({}, false)
            expect(util.getLatestKey('streamId')).toBe(undefined)
        })

        it('returns key passed in constructor', () => {
            const lastKey = crypto.randomBytes(32)
            const util = KeyStorageUtil.getKeyStorageUtil({
                streamId: {
                    groupKey: lastKey,
                    start: 7
                }
            }, false)
            expect(util.getLatestKey('streamId')).toStrictEqual({
                groupKey: lastKey,
                start: 7,
            })
        })

        it('returns the last key', () => {
            const util = KeyStorageUtil.getKeyStorageUtil({}, false)
            util.addKey('streamId', crypto.randomBytes(32), 1)
            util.addKey('streamId', crypto.randomBytes(32), 5)
            const lastKey = crypto.randomBytes(32)
            util.addKey('streamId', lastKey, 7)
            expect(util.getLatestKey('streamId')).toStrictEqual({
                groupKey: lastKey,
                start: 7,
            })
        })
    })

    describe('getKeysBetween()', () => {
        it('throws since historical keys are not stored', () => {
            const util = KeyStorageUtil.getKeyStorageUtil({}, false)
            expect(() => util.getKeysBetween('wrong-streamId', 1, 2)).toThrow()
        })
    })
})
