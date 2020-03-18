import assert from 'assert'
import crypto from 'crypto'

import KeyStorageUtil from '../../src/KeyStorageUtil'

describe('KeyHistoryStorageUtil', () => {
    describe('hasKey()', () => {
        it('returns true iff there is a GroupKeyHistory for the stream', () => {
            const util = KeyStorageUtil.getKeyStorageUtil({
                streamId: {
                    groupKey: crypto.randomBytes(32),
                    start: Date.now()
                }
            })
            assert.strictEqual(util.hasKey('streamId'), true)
            assert.strictEqual(util.hasKey('wrong-streamId'), false)
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
            assert.throws(() => {
                util.addKey('streamId', crypto.randomBytes(32), 0)
            }, /Error/)
        })
    })
    describe('getLatestKey()', () => {
        it('returns undefined if no key history', () => {
            const util = KeyStorageUtil.getKeyStorageUtil()
            assert.strictEqual(util.getLatestKey('streamId'), undefined)
        })
        it('returns key passed in constructor', () => {
            const lastKey = crypto.randomBytes(32)
            const util = KeyStorageUtil.getKeyStorageUtil({
                streamId: {
                    groupKey: lastKey,
                    start: 7
                }
            })
            assert.deepStrictEqual(util.getLatestKey('streamId'), {
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
            assert.deepStrictEqual(util.getLatestKey('streamId'), {
                groupKey: lastKey,
                start: 7,
            })
        })
    })
    describe('getKeysBetween()', () => {
        it('returns empty array for wrong streamId', () => {
            const util = KeyStorageUtil.getKeyStorageUtil()
            assert.deepStrictEqual(util.getKeysBetween('wrong-streamId', 1, 2), [])
        })
        it('returns empty array when end time is before start of first key', () => {
            const util = KeyStorageUtil.getKeyStorageUtil()
            util.addKey('streamId', crypto.randomBytes(32), 10)
            assert.deepStrictEqual(util.getKeysBetween('streamId', 1, 9), [])
        })
        it('returns only the latest key when start time is after last key', () => {
            const util = KeyStorageUtil.getKeyStorageUtil()
            util.addKey('streamId', crypto.randomBytes(32), 5)
            const lastKey = crypto.randomBytes(32)
            util.addKey('streamId', lastKey, 10)
            assert.deepStrictEqual(util.getKeysBetween('streamId', 15, 120), [{
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
            assert.deepStrictEqual(util.getKeysBetween('streamId', 23, 47), expectedKeys)
            assert.deepStrictEqual(util.getKeysBetween('streamId', 20, 40), expectedKeys)
        })
    })
})
