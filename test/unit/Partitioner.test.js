const assert = require('assert')
const partitioner = require('../../src/Partitioner')

describe('partitioner', () => {
    it('should throw if partition count is not defined', () => {
        assert.throws(() => {
            partitioner.partition(undefined, 'foo')
        })
    })

    it('should always return partition 0 for all keys if partition count is 1', () => {
        for (let i = 0; i < 100; i++) {
            assert.equal(partitioner.partition(1, `foo${i}`), 0)
        }
    })

    it('should use murmur2 partitioner and produce same results as org.apache.kafka.common.utils.Utils.murmur2(byte[])', () => {
        const keys = []
        for (let i = 0; i < 100; i++) {
            keys.push(`key-${i}`)
        }
        // Results must be the same as those produced by StreamService#partition()
        const correctResults = [5, 6, 3, 9, 3, 0, 2, 8, 2, 6, 9, 5, 5, 8, 5, 0, 0, 7, 2, 8, 5, 6,
            8, 1, 7, 9, 2, 1, 8, 5, 6, 4, 3, 3, 1, 7, 1, 5, 2, 8, 3, 3, 8, 6, 8, 7, 4, 8, 2, 3, 5,
            2, 8, 8, 8, 9, 8, 2, 7, 7, 0, 8, 8, 5, 9, 9, 9, 7, 2, 7, 0, 4, 4, 6, 4, 8, 5, 5, 0, 8,
            2, 5, 1, 8, 6, 8, 8, 1, 2, 0, 7, 3, 2, 2, 5, 7, 9, 6, 4, 7]

        assert.equal(correctResults.length, keys.length, 'key array and result array are different size!')

        for (let i = 0; i < keys.length; i++) {
            const partition = partitioner.partition(10, keys[i])
            assert.equal(
                correctResults[i], partition,
                `Partition is incorrect for key: ${keys[i]}. Was: ${partition}, should be: ${correctResults[i]}`,
            )
        }
    })
})
