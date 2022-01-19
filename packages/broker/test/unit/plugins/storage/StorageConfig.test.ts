/* eslint-disable no-underscore-dangle, object-curly-newline */
import StreamrClient, { Stream } from 'streamr-client'
import { StorageConfig, StorageConfigListener } from '../../../../src/plugins/storage/StorageConfig'
import { NetworkNode } from 'streamr-network'
import { StreamPartIDUtils } from 'streamr-client-protocol'

describe('StorageConfig', () => {
    let client: StreamrClient
    beforeAll(async () => {
        client = {} as StreamrClient
        client.getStoredStreamsOf = () => Promise.resolve([
            {
                id: 'foo',
                partitions: 2
            } as Stream,
            {
                id: 'bar',
                partitions: 1
            } as Stream,
        ])
    })

    describe('single storage node', () => {
        let config: StorageConfig
        let listener: StorageConfigListener

        beforeEach(async () => {
            config = new StorageConfig('nodeId', 1, 0, client, {} as NetworkNode)
            // @ts-expect-error private
            config.setStreamParts(new Set(['existing1#0', 'existing2#0', 'existing2#1', 'existing3#0']))
            listener = {
                onStreamPartAdded: jest.fn(),
                onStreamPartRemoved: jest.fn()
            }
            config.addChangeListener(listener)
        })

        it('setStreams', () => {
            // @ts-expect-error private
            config.setStreamParts(new Set(['existing2#0', 'existing3#0', 'new1#0', 'new2#0']))
            expect(listener.onStreamPartAdded).toBeCalledTimes(2)
            expect(listener.onStreamPartAdded).toHaveBeenCalledWith(StreamPartIDUtils.parse('new1#0'))
            expect(listener.onStreamPartAdded).toHaveBeenCalledWith(StreamPartIDUtils.parse('new2#0'))
            // doesn't remove immediately
            expect(listener.onStreamPartRemoved).toBeCalledTimes(0)
            // calling it again will remove it
            // @ts-expect-error private
            config.setStreamParts(new Set(['existing2#0', 'existing3#0', 'new1#0', 'new2#0']))
            expect(listener.onStreamPartRemoved).toHaveBeenCalledWith(StreamPartIDUtils.parse('existing1#0'))
            expect(listener.onStreamPartRemoved).toHaveBeenCalledWith(StreamPartIDUtils.parse('existing2#1'))
            expect(config.hasStreamPart(StreamPartIDUtils.parse('new1#0'))).toBeTruthy()
            expect(config.hasStreamPart(StreamPartIDUtils.parse('existing1#0'))).toBeFalsy()
            expect(config.hasStreamPart(StreamPartIDUtils.parse('other#0'))).toBeFalsy()
        })

        it('addStream', () => {
            // @ts-expect-error private
            config.addStreamParts(new Set(['loremipsum#0', 'foo#0', 'bar#0']))
            expect(listener.onStreamPartAdded).toBeCalledTimes(3)
            expect(listener.onStreamPartAdded).toHaveBeenCalledWith(StreamPartIDUtils.parse('loremipsum#0'))
            expect(listener.onStreamPartAdded).toHaveBeenCalledWith(StreamPartIDUtils.parse('foo#0'))
            expect(listener.onStreamPartAdded).toHaveBeenCalledWith(StreamPartIDUtils.parse('bar#0'))
        })

        it('removeStreams', () => {
            // @ts-expect-error private
            config.removeStreamParts(new Set(['existing2#0', 'existing2#1']))
            expect(listener.onStreamPartRemoved).toBeCalledTimes(2)
            expect(listener.onStreamPartRemoved).toHaveBeenCalledWith(StreamPartIDUtils.parse('existing2#0'))
            expect(listener.onStreamPartRemoved).toHaveBeenCalledWith(StreamPartIDUtils.parse('existing2#1'))
        })

        it('refresh', async () => {
            await config.refresh()
            expect(config.hasStreamPart(StreamPartIDUtils.parse('foo#0'))).toBeTruthy()
            expect(config.hasStreamPart(StreamPartIDUtils.parse('foo#1'))).toBeTruthy()
            expect(config.hasStreamPart(StreamPartIDUtils.parse('bar#0'))).toBeTruthy()
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
            expect(config.hasStreamPart(StreamPartIDUtils.parse('foo#0'))).toBeTruthy()
            expect(config.hasStreamPart(StreamPartIDUtils.parse('foo#1'))).toBeTruthy()
        })
    })

    describe('storage cluster', () => {
        let configs: StorageConfig[]

        beforeAll(async () => {
            client = {} as StreamrClient
            client.getStoredStreamsOf = () => Promise.resolve([
                {
                    id: 'foo',
                    partitions: 100
                } as Stream,
                {
                    id: 'bar',
                    partitions: 100
                } as Stream,
            ])
        })
    
        beforeEach(() => {
            configs = [
                new StorageConfig('nodeId', 3, 0, client, {} as NetworkNode),
                new StorageConfig('nodeId', 3, 1, client, {} as NetworkNode),
                new StorageConfig('nodeId', 3, 2, client, {} as NetworkNode),
            ]
        })

        it('refresh', async () => {
            await Promise.all(configs.map((config) => config.refresh()))
            // @ts-expect-error private field
            expect(configs[0].streamParts.size).toBe(61)
            // @ts-expect-error private field
            expect(configs[1].streamParts.size).toBe(67)
            // @ts-expect-error private field
            expect(configs[2].streamParts.size).toBe(72)
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
            // @ts-expect-error private field
            expect(configs[0].streamParts.size).toBe(23)
            // @ts-expect-error private field
            expect(configs[1].streamParts.size).toBe(42)
            // @ts-expect-error private field
            expect(configs[2].streamParts.size).toBe(35)
        })
    })
})
