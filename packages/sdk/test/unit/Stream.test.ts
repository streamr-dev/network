import 'reflect-metadata'

import { toStreamID } from '@streamr/utils'
import { Stream } from '../../src/Stream'
import { StreamFactory } from '../../src/StreamFactory'
import { StreamRegistry } from '../../src/contracts/StreamRegistry'

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
                updateStream: jest.fn().mockRejectedValue(new Error('mock-error')),
                clearStreamCache: jest.fn()
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
            expect(streamRegistry.clearStreamCache).toBeCalledWith('mock-id')
        })
    })

    describe('parse metadata', () => {
        it('happy path', () => {
            const metadata = JSON.stringify({
                partitions: 50,
                foo: 'bar'
            })
            expect(Stream.parseMetadata(metadata)).toEqual({
                partitions: 50,
                foo: 'bar'
            })
        })

        it('no partition count in valid JSON', () => {
            const metadata = JSON.stringify({
                foo: 'bar'
            })
            expect(Stream.parseMetadata(metadata)).toEqual({
                foo: 'bar'
            })
        })

        it('invalid partition count', () => {
            const metadata = JSON.stringify({
                partitions: 150
            })
            expect(Stream.parseMetadata(metadata)).toEqual({
                partitions: 150
            })
        })

        it('empty metadata', () => {
            const metadata = ''
            expect(Stream.parseMetadata(metadata)).toEqual({})
        })

        it('invalid JSON', () => {
            const metadata = 'invalid-json'
            expect(Stream.parseMetadata(metadata)).toEqual({})
        })
    })
})
