import 'reflect-metadata'

import { toStreamID } from '@streamr/protocol'
import { Stream } from '../../src/Stream'
import { StreamFactory } from '../../src/StreamFactory'
import { StreamRegistry } from '../../src/registry/StreamRegistry'
import { StreamRegistryCached } from '../../src/registry/StreamRegistryCached'

const createStreamFactory = (streamRegistry?: StreamRegistry, streamRegistryCached?: StreamRegistryCached) => {
    return new StreamFactory(
        undefined as any,
        undefined as any,
        undefined as any,
        streamRegistryCached as any,
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
        expect(stream.getMetadata().config?.fields).toEqual([])
    })

    it('getMetadata', () => {
        const factory = createStreamFactory()
        const stream = factory.createStream(toStreamID('mock-id'), {
            partitions: 10,
            storageDays: 20
        })
        expect(stream.getMetadata()).toEqual({
            partitions: 10,
            storageDays: 20,
            // currently we get also this field, which was not set by the user
            // (maybe the test should pass also if this field is not present)
            config: {
                fields: []
            }
        })
    })

    describe('update', () => {
        it('fields not updated if transaction fails', async () => {
            const clearStream = jest.fn()
            const streamRegistryCached: Partial<StreamRegistryCached> = {
                clearStream
            }
            const streamRegistry: Partial<StreamRegistry> = {
                updateStream: jest.fn().mockRejectedValue(new Error('mock-error'))
            } 
            const factory = createStreamFactory(streamRegistry as any, streamRegistryCached as any)
                
            const stream = factory.createStream(toStreamID('mock-id'), {
                description: 'original-description'
            })

            await expect(() => {
                return stream.update({
                    description: 'updated-description'
                })
            }).rejects.toThrow('mock-error')
            expect(stream.getMetadata().description).toBe('original-description')
            expect(clearStream).toBeCalledWith('mock-id')
        })
    })

    describe('parse metadata', () => {
        it('happy path', () => {
            const metadata = JSON.stringify({
                partitions: 50
            })
            expect(Stream.parseMetadata(metadata).partitions).toBe(50)
        })

        it('no value in valid JSON', () => {
            const metadata = JSON.stringify({
                foo: 'bar'
            })
            expect(Stream.parseMetadata(metadata).partitions).toBe(1)
        })

        it('invalid value', () => {
            const metadata = JSON.stringify({
                partitions: 150
            })
            expect(() => Stream.parseMetadata(metadata)).toThrowError('Could not parse properties from onchain metadata: {\"partitions\":150}')
        })

        it('invalid JSON', () => {
            const metadata = 'invalid-json'
            expect(() => Stream.parseMetadata(metadata)).toThrowError('Could not parse properties from onchain metadata: invalid-json')
        })
    })
})
