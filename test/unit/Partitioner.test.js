const assert = require('assert')
const partition = require('../../src/partition')

describe('partition', () => {
    it('should throw if partition count is not defined', () => {
        assert.throws(() => {
            partition(undefined, 'foo')
        })
    })

    it('should always return partition 0 for all keys if partition count is 1', () => {
        for (let i = 0; i < 100; i++) {
            assert.equal(partition(1, `foo${i}`), 0)
        }
    })

    // eslint-disable-next-line max-len
    it('should use md5 partitioner and produce same results as crypto.createHash(md5).update(string).digest()', () => {
        const keys = []
        for (let i = 0; i < 100; i++) {
            keys.push(`key-${i}`)
        }
        // Results must be the same as those produced by md5
        const correctResults = [6, 7, 4, 4, 9, 1, 8, 0, 6, 6, 7, 6, 7, 3, 2, 2, 0, 9, 4, 9, 9, 5, 5,
            1, 7, 3, 0, 6, 5, 6, 3, 6, 3, 5, 6, 2, 3, 6, 7, 2, 1, 3, 2, 7, 1, 1, 5, 1, 4, 0, 1, 9, 7,
            4, 2, 3, 2, 9, 7, 7, 4, 3, 5, 4, 5, 3, 9, 0, 4, 8, 1, 7, 4, 8, 1, 2, 9, 9, 5, 3, 5, 0, 9,
            4, 3, 9, 6, 7, 8, 6, 4, 6, 0, 1, 1, 5, 8, 3, 9, 7]

        assert.equal(correctResults.length, keys.length, 'key array and result array are different size!')

        for (let i = 0; i < keys.length; i++) {
            const p = partition(10, keys[i])
            assert.equal(
                correctResults[i], p,
                `Partition is incorrect for key: ${keys[i]}. Was: ${p}, should be: ${correctResults[i]}`,
            )
        }
    })
})
