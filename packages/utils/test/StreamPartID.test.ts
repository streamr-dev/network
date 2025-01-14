import { toEthereumAddress } from '../src/EthereumAddress'
import { toStreamID } from '../src/StreamID'
import { StreamPartIDUtils, toStreamPartID } from '../src/StreamPartID'

const INVALID_PARTITIONS = [-1, 100, Math.PI, 'abc' as unknown as number]

const streamId = toStreamID('/foo/bar', toEthereumAddress('0xaAAAaaaaAA123456789012345678901234567890'))

describe('toStreamPartID', () => {
    it('valid arguments', () => {
        expect(toStreamPartID(streamId, 10)).toEqual(`${streamId}#10`)
    })

    it.each(INVALID_PARTITIONS)('throws error on invalid partition %s', (partition) => {
        expect(() => toStreamPartID(streamId, partition)).toThrow(`invalid streamPartition value: ${partition}`)
    })
})

describe('StreamPartIDUtils#parse', () => {
    it('valid argument', () => {
        expect(StreamPartIDUtils.parse(`${streamId}#10`)).toEqual(toStreamPartID(streamId, 10))
    })

    it.each(['', 'foo', 'foo/bar', streamId])('throws error on invalid streamPartId string "%s"', (str) => {
        expect(() => StreamPartIDUtils.parse(str)).toThrow('invalid streamPartId string: ' + str)
    })

    it.each(INVALID_PARTITIONS)('throws error on invalid streamPartId string legacyStream#%s', (partition) => {
        expect(() => StreamPartIDUtils.parse(`legacyStream#${partition}`)).toThrow(
            `invalid streamPartition value: ${Number(partition)}`
        )
    })
})

describe('getter utilities', () => {
    const streamPartId = toStreamPartID(streamId, 10)

    it('getStreamID', () => {
        expect(StreamPartIDUtils.getStreamID(streamPartId)).toEqual(streamId)
    })

    it('getStreamPartition', () => {
        expect(StreamPartIDUtils.getStreamPartition(streamPartId)).toEqual(10)
    })

    it('getStreamIDAndPartition', () => {
        expect(StreamPartIDUtils.getStreamIDAndPartition(streamPartId)).toEqual([streamId, 10])
    })
})

describe('parseRawElements', () => {
    it('empty string', () => {
        expect(StreamPartIDUtils.parseRawElements('')).toEqual(['', undefined])
    })

    it('streamId only', () => {
        expect(StreamPartIDUtils.parseRawElements(streamId)).toEqual([streamId, undefined])
    })

    it('streamId + invalid partition', () => {
        expect(StreamPartIDUtils.parseRawElements(`${streamId}#abc`)).toEqual([streamId, Number.NaN])
    })

    it('streamId + valid partition', () => {
        expect(StreamPartIDUtils.parseRawElements(`${streamId}#10`)).toEqual([streamId, 10])
    })
})
