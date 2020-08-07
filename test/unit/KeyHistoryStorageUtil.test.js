import crypto from 'crypto'

import KeyStorageUtil from '../../src/KeyStorageUtil'

describe.skip('KeyHistoryStorageUtil', () => {
    describe('hasKey()', () => {
        it('returns true iff there is a GroupKeyHistory for the stream', () => {
            const util = KeyStorageUtil.getKeyStorageUtil({
                streamId: {
                    groupKey: crypto.randomBytes(32),
                    start: Date.now()
                }
            })

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
            })

            expect(() => {
                util.addKey('streamId', crypto.randomBytes(32), 0)
            }).toThrow()
        })
    })

    describe('getLatestKey()', () => {
        it('returns undefined if no key history', () => {
            const util = KeyStorageUtil.getKeyStorageUtil()
            expect(util.getLatestKey('streamId')).toBe(undefined)
        })

        it('returns key passed in constructor', () => {
            const lastKey = crypto.randomBytes(32)
            const util = KeyStorageUtil.getKeyStorageUtil({
                streamId: {
                    groupKey: lastKey,
                    start: 7
                }
            })

            expect(util.getLatestKey('streamId')).toStrictEqual({
                groupKey: lastKey,
                start: 7,
            })
        })

        it('returns the last key', () => {
            const util = KeyStorageUtil.getKeyStorageUtil()
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
        it('returns empty array for wrong streamId', () => {
            const util = KeyStorageUtil.getKeyStorageUtil()
            expect(util.getKeysBetween('wrong-streamId', 1, 2)).toStrictEqual([])
        })

        it('returns empty array when end time is before start of first key', () => {
            const util = KeyStorageUtil.getKeyStorageUtil()
            util.addKey('streamId', crypto.randomBytes(32), 10)
            expect(util.getKeysBetween('streamId', 1, 9)).toStrictEqual([])
        })

        it('returns only the latest key when start time is after last key', () => {
            const util = KeyStorageUtil.getKeyStorageUtil()
            util.addKey('streamId', crypto.randomBytes(32), 5)
            const lastKey = crypto.randomBytes(32)
            util.addKey('streamId', lastKey, 10)
            expect(util.getKeysBetween('streamId', 15, 120)).toStrictEqual([{
                groupKey: lastKey,
                start: 10
            }])
        })

        it('returns keys in interval start-end', () => {
            const util = KeyStorageUtil.getKeyStorageUtil()
            const key1 = crypto.randomBytes(32)
            const key2 = crypto.randomBytes(32)
            const key3 = crypto.randomBytes(32)
            const key4 = crypto.randomBytes(32)
            const key5 = crypto.randomBytes(32)

            util.addKey('streamId', key1, 10)
            util.addKey('streamId', key2, 20)
            util.addKey('streamId', key3, 30)
            util.addKey('streamId', key4, 40)
            util.addKey('streamId', key5, 50)

            const expectedKeys = [{
                groupKey: key2,
                start: 20
            }, {
                groupKey: key3,
                start: 30
            }, {
                groupKey: key4,
                start: 40
            }]

            expect(util.getKeysBetween('streamId', 23, 47)).toStrictEqual(expectedKeys)
            expect(util.getKeysBetween('streamId', 20, 40)).toStrictEqual(expectedKeys)
        })
    })
})
