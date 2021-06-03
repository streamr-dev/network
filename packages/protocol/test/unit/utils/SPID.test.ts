import SPID  from '../../../src/utils/SPID'

describe('SPID', () => {
    const STREAM_ID = 'test-stream-id'
    const PARTITION = 1

    it('can use object destructuring', () => {
        const spid = new SPID(STREAM_ID, PARTITION)
        const { id, partition, key } = spid
        expect(id).toBe(STREAM_ID)
        expect(partition).toBe(PARTITION)
        expect(key).toBe(spid.toString())
    })

    it('defaults partition to 0', () => {
        const spid = new SPID(STREAM_ID)
        expect(spid.id).toEqual(STREAM_ID)
        expect(spid.partition).toBe(0)
    })

    it('does not lowercase streamId', () => {
        const spid = new SPID(STREAM_ID.toUpperCase())
        expect(spid.id).toEqual(STREAM_ID.toUpperCase())
        expect(spid.partition).toBe(0)
    })

    it('can get key from string', () => {
        const spid = new SPID(STREAM_ID, PARTITION)
        const key = SPID.toKey(spid.toString())
        expect(key).toBe(spid.key)
    })

    it('requires valid streamId', () => {
        const badTypes = [
            undefined,
            null,
            {},
            /regex/,
            [],
            [1,2,3],
            Number.NaN,
            Symbol('bad streamid'),
            BigInt(1),
            BigInt(0),
            function() {},
            new Uint8Array()
        ]
        const badStreamIds = [
            '', // too short
            0, // not a string
        ]
        for (const streamId of [...badTypes, ...badStreamIds]) {
            expect(() => {
                // @ts-expect-error testing bad input
                new SPID(streamId, PARTITION)
            }).toThrow()
        }
    })

    it('requires valid partition', () => {
        const badTypes = [
            null,
            {},
            '',
            /regex/,
            [],
            [1,2,3],
            Symbol('bad streamid'),
            BigInt(1),
            BigInt(0),
            function() {},
            new Uint8Array()
        ]

        const badPartitions = [
            '0', // not a number
            -1, // not positive
            0.1, // not integer
            -0.1, // negative and not integer
            Number.POSITIVE_INFINITY, // Too big
            Number.NEGATIVE_INFINITY, // Not positive
            Number.MAX_SAFE_INTEGER + 1, // Not safe
            Number.NaN, // NaN
        ]

        for (const partition of [...badTypes, ...badPartitions]) {
            expect(() => {
                // @ts-expect-error testing bad input
                new SPID(STREAM_ID, partition)
            }).toThrow()
        }
    })

    describe('from', () => {
        it('returns self if already a spid', () => {
            const spid = new SPID(STREAM_ID, PARTITION)
            expect(SPID.from(spid)).toBe(spid)
        })

        it('can parse valid strings', () => {
            // @ts-expect-error SPID.SEPARATOR is protected
            const spid = SPID.from(`${STREAM_ID}${SPID.SEPARATOR}${PARTITION}`)
            expect(spid.id).toBe(STREAM_ID)
            expect(spid.partition).toBe(PARTITION)
        })

        it('does not require partition in string', () => {
            const spid = SPID.from(STREAM_ID)
            expect(spid.id).toBe(STREAM_ID)
            expect(spid.partition).toBe(0)
        })

        it('can parse {id, partition} objects', () => {
            const spid = SPID.from({id: STREAM_ID, partition: PARTITION})
            expect(spid.id).toBe(STREAM_ID)
            expect(spid.partition).toBe(PARTITION)
        })

        it('can parse {streamId, streamPartition} objects', () => {
            const spid = SPID.from({streamId: STREAM_ID, streamPartition: PARTITION})
            expect(spid.id).toBe(STREAM_ID)
            expect(spid.partition).toBe(PARTITION)
        })

        it('prioritises {streamId, streamPartition} over {id, partition}', () => {
            const spid = SPID.from({id: `not${STREAM_ID}`, partition: PARTITION + 1, streamId: STREAM_ID, streamPartition: PARTITION})
            expect(spid.id).toBe(STREAM_ID)
            expect(spid.partition).toBe(PARTITION)
        })
    })

    describe('toString', () => {
        it('creates a string', () => {
            const spid = new SPID(STREAM_ID, PARTITION)
            // @ts-expect-error SPID.SEPARATOR is protected
            expect(spid.toString()).toBe(`${STREAM_ID}${SPID.SEPARATOR}${PARTITION}`)
        })

        it('is valid input into from', () => {
            const spid = new SPID(STREAM_ID, PARTITION)
            const spid2 = SPID.from(spid.toString())
            expect(spid2.id).toBe(STREAM_ID)
            expect(spid2.partition).toBe(PARTITION)
        })

        it('is the same as key', () => {
            const spid = new SPID(STREAM_ID, PARTITION)
            expect(spid.toString()).toBe(spid.key)
        })
    })

    describe('equals', () => {
        it('works with spids', () => {
            const spid1 = new SPID(STREAM_ID, PARTITION)
            const spid2 = new SPID(STREAM_ID.toUpperCase(), PARTITION)
            const spid3 = new SPID(STREAM_ID)
            const spid4 = new SPID('other id', PARTITION)
            // same should be equal
            expect(spid1.equals(spid1)).toBeTruthy()
            // different ids but same values should be equal
            expect(spid1.equals(spid2)).toBeTruthy()
            // different partitions is not equal
            expect(spid1.equals(spid3)).not.toBeTruthy()
            // different streamIds is not equal
            expect(spid1.equals(spid4)).not.toBeTruthy()
        })

        it('works with spidish', () => {
            const spid = new SPID(STREAM_ID, PARTITION)
            const spidString = spid.toString()
            expect(spid.equals(spidString)).toBeTruthy()
            // @ts-expect-error SPID.SEPARATOR is protected
            expect(spid.equals(`${STREAM_ID}${SPID.SEPARATOR}0`)).not.toBeTruthy()
            expect(spid.equals('')).not.toBeTruthy()
            // @ts-expect-error testing bad input
            expect(spid.equals()).not.toBeTruthy()
            // @ts-expect-error testing bad input
            expect(spid.equals([1,2])).not.toBeTruthy()
        })
    })
})
