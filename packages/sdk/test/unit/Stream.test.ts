import 'reflect-metadata'

import { toStreamID } from '@streamr/utils'
import { StreamrClient } from '../../src/StreamrClient'
import { Stream } from '../../src/Stream'

describe('Stream', () => {

    it('initial fields', () => {
        const stream = new Stream(toStreamID('mock-id'), {}, undefined as any)
        expect(stream.getMetadata()).toEqual({})
    })

    it('getMetadata', () => {
        const stream = new Stream(toStreamID('mock-id'), {
            partitions: 10,
            storageDays: 20
        }, undefined as any)
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
        )
        expect(() => stream.getPartitionCount()).toThrowStreamrError({
            message: 'Invalid partition count: 150',
            code: 'INVALID_STREAM_METADATA'
        })
    })

    describe('setMetadata', () => {
        it('fields not updated if transaction fails', async () => {
            const client: Partial<StreamrClient> = {
                updateStream: jest.fn().mockRejectedValue(new Error('mock-error')),
            } 

            const stream = new Stream(toStreamID('mock-id'), {
                description: 'original-description'
            }, client as any)

            await expect(() => {
                return stream.setMetadata({
                    description: 'updated-description'
                })
            }).rejects.toThrow('mock-error')
            expect(stream.getMetadata().description).toBe('original-description')
        })
    })
})
