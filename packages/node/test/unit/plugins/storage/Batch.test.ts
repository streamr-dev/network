import { randomUserId } from '@streamr/test-utils'
import { Batch, InsertRecord, State } from '../../../../src/plugins/storage/Batch'
import { BucketId } from '../../../../src/plugins/storage/Bucket'

const record: InsertRecord = {
    streamId: 'streamId',
    partition: 0,
    timestamp: 123,
    sequenceNo: 123,
    publisherId: randomUserId(),
    msgChainId: 'msgChainId',
    payload: Buffer.from(new Uint8Array([1, 2, 3])) // len = 3
}

describe('Batch', () => {
    it('should throw if constructor parameters are not correct', () => {
        expect(() => {
            new Batch('', 123, 123, 123, 123)
        }).toThrow(new TypeError('bucketId must be not empty string'))

        expect(() => {
            new Batch('bucketId', 0, 123, 123, 123)
        }).toThrow(new TypeError('maxSize must be > 0'))

        expect(() => {
            new Batch('bucketId', 1, 0, 123, 123)
        }).toThrow(new TypeError('maxRecordCount must be > 0'))

        expect(() => {
            new Batch('bucketId', 1, 1, 0, 123)
        }).toThrow(new TypeError('closeTimeout must be > 0'))

        expect(() => {
            new Batch('bucketId', 1, 1, 1, 0)
        }).toThrow(new TypeError('maxRetries must be > 0'))

        expect(() => {
            new Batch('bucketId', 1, 1, 1, 1)
        }).not.toThrow()
    })

    it('empty batch should emit state after closeTimeout with empty values', (done) => {
        const batch = new Batch('bucketId', 1, 1, 10, 1)

        expect(batch.state).toEqual(Batch.states.OPENED)

        batch.on('locked', (_bucketId: BucketId, id: number, state: State, size: number, recordCount: number) => {
            expect(id).toEqual(batch.getId())
            expect('bucketId').toEqual(batch.getBucketId())
            expect(state).toEqual(Batch.states.LOCKED)
            expect(size).toEqual(0)
            expect(recordCount).toEqual(0)
            done()
        })
    })

    it('filled batch should emit state after closeTimeout with not empty values', (done) => {
        const batch = new Batch('bucketId', 1, 1, 10, 1)

        batch.push(record)
        batch.push(record)
        batch.push(record)

        batch.on('locked', (_bucketId: BucketId, id: number, state: State, size: number, recordCount: number) => {
            expect(id).toEqual(batch.getId())
            expect(state).toEqual(Batch.states.LOCKED)
            expect(size).toEqual(9)
            expect(recordCount).toEqual(3)
            done()
        })
    })

    it('isFull by size', () => {
        const batch = new Batch('bucketId', 9, 99999, 10, 1)

        expect(batch.isFull()).toEqual(false)
        batch.push(record)

        expect(batch.isFull()).toEqual(false)
        batch.push(record)

        expect(batch.isFull()).toEqual(false)
        batch.push(record)

        expect(batch.isFull()).toEqual(true)
    })

    it('isFull by number of records', () => {
        const batch = new Batch('streamId', 99999, 3, 10, 1)

        expect(batch.isFull()).toEqual(false)
        batch.push(record)

        expect(batch.isFull()).toEqual(false)
        batch.push(record)

        expect(batch.isFull()).toEqual(false)
        batch.push(record)

        expect(batch.isFull()).toEqual(true)
    })

    it('clear() clears timeout and messages', () => {
        const batch = new Batch('streamId', 3, 3, 10, 1)
        batch.push(record)

        expect(batch.records.length).toEqual(1)
        // @ts-expect-error access to private
        // eslint-disable-next-line no-underscore-dangle
        expect(batch.timeout._idleTimeout).toEqual(10)

        batch.clear()

        expect(batch.records.length).toEqual(0)
        // @ts-expect-error access to private
        // eslint-disable-next-line no-underscore-dangle
        expect(batch.timeout._idleTimeout).toEqual(-1)
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
