/* eslint-disable no-new */
import { Bucket } from '../../../src/storage/Bucket'

describe('Bucket', () => {
    it('should throw if constructor parameters are not correct', () => {
        expect(() => {
            new Bucket('', '', 123, 123, 123, new Date('2019-07-19'), 123, 123, 123)
        }).toThrow(new TypeError('id must be not empty string'))

        expect(() => {
            new Bucket('id', '', 123, 123, 123, new Date('2019-07-19'), 123, 123, 123)
        }).toThrow(new TypeError('streamId must be not empty string'))

        expect(() => {
            new Bucket('id', 'streamId', -1, 123, 123, new Date('2019-07-19'), 123, 123, 123)
        }).toThrow(new TypeError('partition must be >= 0'))

        expect(() => {
            new Bucket('id', 'streamId', 0, -1, 123, new Date('2019-07-19'), 123, 123, 123)
        }).toThrow(new TypeError('size must be => 0'))

        expect(() => {
            new Bucket('id', 'streamId', 0, 0, -1, new Date('2019-07-19'), 123, 123, 123)
        }).toThrow(new TypeError('records must be => 0'))

        expect(() => {
            new Bucket('id', 'streamId', 0, 0, 0, undefined as any, 123, 123, 123)
        }).toThrow(new TypeError('dateCreate must be instance of Date'))

        expect(() => {
            new Bucket('id', 'streamId', 0, 0, 0, new Date('2019-07-19'), 0, 123, 123)
        }).toThrow(new TypeError('maxSize must be > 0'))

        expect(() => {
            new Bucket('id', 'streamId', 0, 0, 0, new Date('2019-07-19'), 1, 0, 123)
        }).toThrow(new TypeError('maxRecords must be > 0'))

        expect(() => {
            new Bucket('id', 'streamId', 0, 0, 0, new Date('2019-07-19'), 1, 1, 0)
        }).toThrow(new TypeError('keepAliveSeconds must be > 0'))

        expect(() => {
            new Bucket('id', 'streamId', 0, 0, 0, new Date('2019-07-19'), 1, 1, 1)
        }).not.toThrow()
    })

    it('incrementBucket and isAlmostFull', () => {
        const bucket = new Bucket('id', 'streamId', 0, 0, 0, new Date(), 4, 12, 1)

        expect(bucket.isAlmostFull(0)).toBeFalsy()

        bucket.incrementBucket(1)
        bucket.incrementBucket(1)
        bucket.incrementBucket(1)

        expect(bucket.isAlmostFull(0)).toBeFalsy()
        expect(bucket.isAlmostFull(25)).toBeTruthy()

        bucket.incrementBucket(1)
        expect(bucket.isAlmostFull(0)).toBeTruthy()
        expect(bucket.isAlmostFull(25)).toBeTruthy()
        expect(bucket.isAlmostFull(0)).toBeTruthy()
    })

    it('ttl is updated on each incrementBucket, if not isAlive switches to false', () => {
        jest.useFakeTimers('modern').setSystemTime(0)
        const bucket = new Bucket('id', 'streamId', 0, 0, 0, new Date(), 3, 9, 1)

        expect(bucket.getId()).toEqual('id')
        expect(bucket.isAlive()).toBeTruthy()

        jest.advanceTimersByTime(1001)

        expect(bucket.isAlive()).toBeFalsy()
        // @ts-expect-error
        bucket.incrementBucket(1, 3)
        expect(bucket.isAlive()).toBeTruthy()
    })

    it('on each incrementBucket isStored becomes false', () => {
        const bucket = new Bucket('id', 'streamId', 0, 0, 0, new Date(), 3, 9, 1)
        expect(bucket.isStored()).toBeFalsy()

        bucket.setStored()
        expect(bucket.isStored()).toBeTruthy()

        // @ts-expect-error
        bucket.incrementBucket(1, 1)
        expect(bucket.isStored()).toBeFalsy()
    })
})
