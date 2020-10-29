/* eslint-disable no-new */
const Batch = require('../../../src/new-storage/Batch')

const streamMessage = {
    serialize() {
        return 'ABC' // len = 3
    }
}

describe('Batch', () => {
    it('should throw if constructor parameters are not correct', () => {
        expect(() => {
            new Batch()
        }).toThrow(new TypeError('bucketId must be not empty string'))

        expect(() => {
            new Batch('bucketId')
        }).toThrow(new TypeError('maxSize must be > 0'))

        expect(() => {
            new Batch('bucketId', 1)
        }).toThrow(new TypeError('maxRecords must be > 0'))

        expect(() => {
            new Batch('bucketId', 1, 1)
        }).toThrow(new TypeError('closeTimeout must be > 0'))

        expect(() => {
            new Batch('bucketId', 1, 1, 1)
        }).toThrow(new TypeError('maxRetries must be > 0'))

        expect(() => {
            new Batch('bucketId', 1, 1, 1, 1)
        }).not.toThrow()
    })

    it('empty batch should emit state after closeTimeout with empty values', (done) => {
        const batch = new Batch('bucketId', 1, 1, 10, 1)

        expect(batch.state).toEqual(Batch.states.OPENED)

        batch.on('locked', (bucketId, id, state, size, numberOfRecords) => {
            expect(id).toEqual(batch.getId())
            expect('bucketId').toEqual(batch.getBucketId())
            expect(state).toEqual(Batch.states.LOCKED)
            expect(size).toEqual(0)
            expect(numberOfRecords).toEqual(0)
            done()
        })
    })

    it('filled batch should emit state after closeTimeout with not empty values', (done) => {
        const batch = new Batch('bucketId', 1, 1, 10, 1)

        batch.push(streamMessage)
        batch.push(streamMessage)
        batch.push(streamMessage)

        batch.on('locked', (bucketId, id, state, size, numberOfRecords) => {
            expect(id).toEqual(batch.getId())
            expect(state).toEqual(Batch.states.LOCKED)
            expect(size).toEqual(9)
            expect(numberOfRecords).toEqual(3)
            done()
        })
    })

    it('isFull by size', () => {
        const batch = new Batch('bucketId', 9, 99999, 10, 1)

        expect(batch.isFull()).toEqual(false)
        batch.push(streamMessage)

        expect(batch.isFull()).toEqual(false)
        batch.push(streamMessage)

        expect(batch.isFull()).toEqual(false)
        batch.push(streamMessage)

        expect(batch.isFull()).toEqual(true)
    })

    it('isFull by number of records', () => {
        const batch = new Batch('streamId', 99999, 3, 10, 1)

        expect(batch.isFull()).toEqual(false)
        batch.push(streamMessage)

        expect(batch.isFull()).toEqual(false)
        batch.push(streamMessage)

        expect(batch.isFull()).toEqual(false)
        batch.push(streamMessage)

        expect(batch.isFull()).toEqual(true)
    })

    it('clear() clears timeout and messages', () => {
        const batch = new Batch('streamId', 3, 3, 10, 1)
        batch.push(streamMessage)

        expect(batch.streamMessages.length).toEqual(1)
        // eslint-disable-next-line no-underscore-dangle
        expect(batch._timeout._idleTimeout).toEqual(10)

        batch.clear()

        expect(batch.streamMessages.length).toEqual(0)
        // eslint-disable-next-line no-underscore-dangle
        expect(batch._timeout._idleTimeout).toEqual(-1)
    })

    it('setClose() emits close state', (done) => {
        const batch = new Batch('streamId', 3, 3, 10, 1)

        batch.on('locked', () => {
            done()
        })

        batch.lock()
    })

    it('batch fires first close state, then after setPending', (done) => {
        const batch = new Batch('bucketId', 3, 3, 10, 1)

        batch.lock()
        expect(batch.retries).toEqual(0)
        batch.scheduleInsert()

        batch.on('pending', () => {
            expect(batch.retries).toEqual(1)
            done()
        })
    })

    it('reachedMaxRetries', (done) => {
        const batch = new Batch('bucketId', 3, 3, 10, 1)
        expect(batch.reachedMaxRetries()).toBeFalsy()

        batch.scheduleInsert()

        batch.on('pending', () => {
            expect(batch.reachedMaxRetries()).toBeTruthy()
            done()
        })
    })
})
