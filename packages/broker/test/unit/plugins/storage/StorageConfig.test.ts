/* eslint-disable no-underscore-dangle, object-curly-newline */
import { StorageConfig, StorageConfigListener } from '../../../../src/plugins/storage/StorageConfig'
import nock from 'nock'

describe('StorageConfig', () => {

    afterEach(function () {
        if (!nock.isDone()) {
            nock.cleanAll()
            throw new Error('Not all nock interceptors were used!')
        }
    })

    describe('single storage node', () => {
        let config: StorageConfig
        let listener: StorageConfigListener

        beforeEach(() => {
            config = new StorageConfig('nodeId', 1, 0, 'http://api-url.com/path')
            // @ts-expect-error private
            config.setStreams(new Set(['existing1::0', 'existing2::0', 'existing2::1', 'existing3::0']))
            listener = {
                onStreamAdded: jest.fn(),
                onStreamRemoved: jest.fn()
            }
            config.addChangeListener(listener)
        })

        it('setStreams', () => {
            // @ts-expect-error private
            config.setStreams(new Set(['existing2::0', 'existing3::0', 'new1::0', 'new2::0']))
            expect(listener.onStreamAdded).toBeCalledTimes(2)
            expect(listener.onStreamAdded).toHaveBeenCalledWith({ id: 'new1', partition: 0 })
            expect(listener.onStreamAdded).toHaveBeenCalledWith({ id: 'new2', partition: 0 })
            expect(listener.onStreamRemoved).toBeCalledTimes(2)
            expect(listener.onStreamRemoved).toHaveBeenCalledWith({ id: 'existing1', partition: 0 })
            expect(listener.onStreamRemoved).toHaveBeenCalledWith({ id: 'existing2', partition: 1 })
            expect(config.hasStream({ id: 'new1', partition: 0 })).toBeTruthy()
            expect(config.hasStream({ id: 'existing1', partition: 0 })).toBeFalsy()
            expect(config.hasStream({ id: 'other', partition: 0 })).toBeFalsy()
        })

        it('addStream', () => {
            // @ts-expect-error private
            config.addStreams(new Set(['loremipsum::0', 'foo::0', 'bar::0']))
            expect(listener.onStreamAdded).toBeCalledTimes(3)
            expect(listener.onStreamAdded).toHaveBeenCalledWith({ id: 'loremipsum', partition: 0 })
            expect(listener.onStreamAdded).toHaveBeenCalledWith({ id: 'foo', partition: 0 })
            expect(listener.onStreamAdded).toHaveBeenCalledWith({ id: 'bar', partition: 0 })
        })

        it('removeStreams', () => {
            // @ts-expect-error private
            config.removeStreams(new Set(['existing2::0', 'existing2::1']))
            expect(listener.onStreamRemoved).toBeCalledTimes(2)
            expect(listener.onStreamRemoved).toHaveBeenCalledWith({ id: 'existing2', partition: 0 })
            expect(listener.onStreamRemoved).toHaveBeenCalledWith({ id: 'existing2', partition: 1 })
        })

        it('refresh', async () => {
            nock('http://api-url.com')
                .get('/path/storageNodes/nodeId/streams')
                .reply(200, [
                    {
                        id: 'foo',
                        partitions: 2
                    },
                    {
                        id: 'bar',
                        partitions: 1
                    },
                ])

            await config.refresh()
            expect(config.hasStream({ id: 'foo', partition: 0 })).toBeTruthy()
            expect(config.hasStream({ id: 'foo', partition: 1 })).toBeTruthy()
            expect(config.hasStream({ id: 'bar', partition: 0 })).toBeTruthy()
        })

        it('onAssignmentEvent', () => {
            config.onAssignmentEvent({ 
                storageNode: 'nodeId', 
                stream: { 
                    id: 'foo', 
                    partitions: 2
                }, 
                event: 'STREAM_ADDED'
            })
            expect(config.hasStream({ id: 'foo', partition: 0 })).toBeTruthy()
            expect(config.hasStream({ id: 'foo', partition: 1 })).toBeTruthy()
        })
    })

    describe('storage cluster', () => {
        let configs: StorageConfig[]

        beforeEach(() => {
            configs = [
                new StorageConfig('nodeId', 3, 0, 'http://api-url.com/path'),
                new StorageConfig('nodeId', 3, 1, 'http://api-url.com/path'),
                new StorageConfig('nodeId', 3, 2, 'http://api-url.com/path'),
            ]
        })

        it('refresh', async () => {
            // One http call per config
            configs.map(() => nock('http://api-url.com')
                .get('/path/storageNodes/nodeId/streams')
                .reply(200, [
                    {
                        id: 'foo',
                        partitions: 100
                    },
                    {
                        id: 'bar',
                        partitions: 100
                    },
                ]))

            await Promise.all(configs.map((config) => config.refresh()))
            expect(configs[0].streamKeys.size).toBe(69)
            expect(configs[1].streamKeys.size).toBe(57)
            expect(configs[2].streamKeys.size).toBe(74)
        })

        it('onAssignmentEvent', () => {
            configs.forEach((config) => config.onAssignmentEvent({ 
                storageNode: 'nodeId', 
                stream: { 
                    id: 'foo', 
                    partitions: 100
                }, 
                event: 'STREAM_ADDED'
            }))
            expect(configs[0].streamKeys.size).toBe(38)
            expect(configs[1].streamKeys.size).toBe(30)
            expect(configs[2].streamKeys.size).toBe(32)
        })
    })
})
