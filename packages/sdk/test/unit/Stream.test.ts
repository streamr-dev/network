import 'reflect-metadata'

import { toStreamID } from '@streamr/utils'
import { StreamRegistry } from '../../src/contracts/StreamRegistry'
import { Stream } from '../../src/Stream'
import { StreamFactory } from '../../src/StreamFactory'

const createStreamFactory = (streamRegistry?: StreamRegistry) => {
    return new StreamFactory(
        undefined as any,
        undefined as any,
        undefined as any,
        streamRegistry as any,
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any
    )
}

describe('Stream', () => {

    it('initial fields', () => {
        const factory = createStreamFactory()
        const stream = factory.createStream(toStreamID('mock-id'), {})
        expect(stream.getMetadata()).toEqual({})
    })

    it('getMetadata', () => {
        const factory = createStreamFactory()
        const stream = factory.createStream(toStreamID('mock-id'), {
            partitions: 10,
            storageDays: 20
        })
        expect(stream.getMetadata()).toEqual({
            partitions: 10,
            storageDays: 20
        })
    })

    it('getPartitionCount', () => {
        const stream = new Stream(
            undefined as any,
            { partitions: 150 },
            undefined as any,
            undefined as any,
            undefined as any,
            undefined as any,
            undefined as any,
            undefined as any,
            undefined as any,
            undefined as any
        )
        expect(() => stream.getPartitionCount()).toThrowStreamrError({
            message: 'Invalid partition count: 150',
            code: 'INVALID_STREAM_METADATA'
        })
    })

    describe('update', () => {
        it('fields not updated if transaction fails', async () => {
            const streamRegistry: Partial<StreamRegistry> = {
                updateStreamMetadata: jest.fn().mockRejectedValue(new Error('mock-error')),
            } 
            const factory = createStreamFactory(streamRegistry as any)

            const stream = factory.createStream(toStreamID('mock-id'), {
                description: 'original-description'
            })

            await expect(() => {
                return stream.update({
                    description: 'updated-description'
                })
            }).rejects.toThrow('mock-error')
            expect(stream.getMetadata().description).toBe('original-description')
        })
    })
})
