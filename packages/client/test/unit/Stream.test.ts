import 'reflect-metadata'
import { container as rootContainer } from 'tsyringe'
import { toStreamID } from 'streamr-client-protocol'
import { initContainer } from '../../src/Container'
import { Stream } from '../../src/Stream'
import { StreamRegistry } from '../../src/registry/StreamRegistry'
import { createStrictConfig } from '../../src/Config'

describe('Stream', () => {
    
    it('initial fields', () => {
        const mockContainer = rootContainer.createChildContainer()
        initContainer(createStrictConfig({}), mockContainer)
        const stream = new Stream({
            id: toStreamID('mock-id')
        }, mockContainer as any)
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
            const stream = new Stream({
                id: toStreamID('mock-id'),
                description: 'original-description'
            }, mockContainer as any)

            await expect(() => {
                return stream.update({
                    description: 'updated-description'
                })
            }).rejects.toThrow('mock-error')
            expect(stream.description).toBe('original-description')
        })
    })
})
