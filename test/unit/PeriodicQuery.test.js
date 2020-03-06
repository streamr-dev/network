const assert = require('assert')
const Stream = require('stream')

const toArray = require('stream-to-array')

const PeriodicQuery = require('../../src/PeriodicQuery')

describe('PeriodicQuery', () => {
    it('calls queryFunction the right number of times before timeout', async () => {
        let counter = 0
        const periodicQuery = new PeriodicQuery(() => {
            counter += 1
            const s = new Stream.Readable({
                objectMode: true,
                read() {},
            })
            s.push(null)
            return s
        }, 100, 950)
        const results = await toArray(periodicQuery.getStreamingResults())
        assert.deepStrictEqual(results, [])
        assert.strictEqual(counter, 10)
    })
    it('calls queryFunction only once and results are as expected', async () => {
        let counter = 0
        const periodicQuery = new PeriodicQuery(() => {
            counter += 1
            const s = new Stream.Readable({
                objectMode: true,
                read() {},
            })
            s.push('data1')
            s.push('data2')
            s.push(null)
            return s
        }, 100, 950)
        const results = await toArray(periodicQuery.getStreamingResults())
        assert.strictEqual(counter, 1)
        assert.deepStrictEqual(results, ['data1', 'data2'])
    })
})
