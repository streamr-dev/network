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
