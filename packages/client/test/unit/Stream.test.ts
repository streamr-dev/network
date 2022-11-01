import 'reflect-metadata'

import { toStreamID } from 'streamr-client-protocol'
import { container as rootContainer } from 'tsyringe'
import { createStrictConfig } from '../../src/Config'
import { initContainer } from '../../src/Container'
import { StreamRegistry } from '../../src/registry/StreamRegistry'
import { StreamFactory } from './../../src/StreamFactory'

describe('Stream', () => {

    it('initial fields', () => {
        const mockContainer = rootContainer.createChildContainer()
        initContainer(createStrictConfig({}), mockContainer)
        const factory = mockContainer.resolve(StreamFactory)
        const stream = factory.createStream({
            id: toStreamID('mock-id')
        })
        expect(stream.config.fields).toEqual([])
    })

    it('toObject', () => {
        const mockContainer = rootContainer.createChildContainer()
        initContainer(createStrictConfig({}), mockContainer)
        const factory = mockContainer.resolve(StreamFactory)
        const stream = factory.createStream({
            id: toStreamID('mock-id'),
            partitions: 10,
            storageDays: 20
        })
        expect(stream.toObject()).toEqual({
            id: 'mock-id',
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
            const config = createStrictConfig({})
            const mockContainer = rootContainer.createChildContainer()
            initContainer(config, mockContainer)
            mockContainer.registerInstance(StreamRegistry, {
                updateStream: jest.fn().mockRejectedValue(new Error('mock-error'))
            } as any)
            const factory = mockContainer.resolve(StreamFactory)
            const stream = factory.createStream({
                id: toStreamID('mock-id'),
                description: 'original-description'
            })

            await expect(() => {
                return stream.update({
                    description: 'updated-description'
                })
            }).rejects.toThrow('mock-error')
            expect(stream.description).toBe('original-description')
        })
    })
})
