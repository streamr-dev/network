import 'reflect-metadata'
import { container as rootContainer } from 'tsyringe'
import { toStreamID } from 'streamr-client-protocol'
import { initContainer } from '../../src/Container'
import { StreamRegistry } from '../../src/registry/StreamRegistry'
import { createStrictConfig } from '../../src/Config'
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
