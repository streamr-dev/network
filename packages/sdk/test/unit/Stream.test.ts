import 'reflect-metadata'

import { Stream } from '../../src/Stream'

describe('Stream', () => {

    it('getPartitionCount', () => {
        const stream = new Stream(
            undefined as any,
            {
                getStreamMetadata: async () => ({ partitions: 150 })
            } as any
        )
        expect(() => stream.getPartitionCount()).rejects.toThrowStreamrError({
            message: 'Invalid partition count: 150',
            code: 'INVALID_STREAM_METADATA'
        })
    })
})
