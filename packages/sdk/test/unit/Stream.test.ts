import 'reflect-metadata'

import { Stream } from '../../src/Stream'

describe('Stream', () => {
    it('getPartitionCount', async () => {
        const stream = new Stream(
            undefined as any,
            {
                getStreamMetadata: async () => ({ partitions: 150 })
            } as any
        )
        await expect(() => stream.getPartitionCount()).rejects.toThrowStreamrClientError({
            message: 'Invalid partition count: 150',
            code: 'INVALID_STREAM_METADATA'
        })
    })
})
