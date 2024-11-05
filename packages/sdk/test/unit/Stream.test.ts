import 'reflect-metadata'

import { toStreamID } from '@streamr/utils'
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
        expect((stream.getMetadata() as any).config.fields).toEqual([])
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
})
