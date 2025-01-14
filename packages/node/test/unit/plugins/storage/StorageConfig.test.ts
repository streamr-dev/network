import { StorageNodeAssignmentEvent, Stream, StreamrClient, StreamrClientEvents } from '@streamr/sdk'
import {
    EthereumAddress,
    StreamPartID,
    StreamPartIDUtils,
    toEthereumAddress,
    toStreamID,
    toStreamPartID,
    wait
} from '@streamr/utils'
import range from 'lodash/range'
import { StorageConfig } from '../../../../src/plugins/storage/StorageConfig'

const { parse } = StreamPartIDUtils

const POLL_TIME = 10

const CLUSTER_ID = toEthereumAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')

const PARTITION_COUNT_LOOKUP: Record<string, number> = Object.freeze({
    'stream-1': 2,
    'stream-2': 4,
    'stream-3': 1
})

function makeStubStream(streamId: string): Stream {
    const partitions = PARTITION_COUNT_LOOKUP[streamId]
    const stub: Partial<Stream> = {
        id: toStreamID(streamId),
        async getStreamParts(): Promise<StreamPartID[]> {
            // TODO: duplicated code from client
            return range(0, partitions).map((p) => toStreamPartID(toStreamID(streamId), p))
        }
    }
    return stub as Stream
}

describe(StorageConfig, () => {
    let getStoredStreams: jest.Mock<Promise<{ streams: Stream[]; blockNumber: number }>, [nodeAddress: EthereumAddress]>
    let storageEventListeners: Map<keyof StreamrClientEvents, (event: StorageNodeAssignmentEvent) => void>
    let stubClient: Pick<StreamrClient, 'getStream' | 'getStoredStreams' | 'on' | 'off'>
    let onStreamPartAdded: jest.Mock<void, [StreamPartID]>
    let onStreamPartRemoved: jest.Mock<void, [StreamPartID]>
    let storageConfig: StorageConfig

    beforeEach(async () => {
        getStoredStreams = jest.fn()
        storageEventListeners = new Map()
        stubClient = {
            getStoredStreams,
            async getStream(streamIdOrPath: string) {
                return makeStubStream(streamIdOrPath)
            },
            on(eventName: keyof StreamrClientEvents, listener: any) {
                storageEventListeners.set(eventName, listener)
            },
            off(eventName: keyof StreamrClientEvents) {
                storageEventListeners.delete(eventName)
            }
        }
        onStreamPartAdded = jest.fn()
        onStreamPartRemoved = jest.fn()
        storageConfig = new StorageConfig(CLUSTER_ID, 1, 0, POLL_TIME, stubClient as StreamrClient, {
            onStreamPartAdded,
            onStreamPartRemoved
        })
        getStoredStreams.mockRejectedValue(new Error('results not available'))
    })

    afterEach(() => {
        storageConfig.destroy()
    })

    it('state starts empty', () => {
        expect(storageConfig.getStreamParts()).toBeEmpty()
    })

    describe('on polled results', () => {
        beforeEach(async () => {
            getStoredStreams.mockResolvedValue({
                streams: [makeStubStream('stream-1'), makeStubStream('stream-2')],
                blockNumber: 10
            })
            await storageConfig.start()
            await wait(POLL_TIME * 2)
        })

        it('stream part listeners invoked', () => {
            expect(onStreamPartAdded).toHaveBeenCalledTimes(6)
            expect(onStreamPartRemoved).toHaveBeenCalledTimes(0)
            expect(onStreamPartAdded.mock.calls).toEqual([
                [parse('stream-1#0')],
                [parse('stream-1#1')],
                [parse('stream-2#0')],
                [parse('stream-2#1')],
                [parse('stream-2#2')],
                [parse('stream-2#3')]
            ])
        })

        it('state is updated', () => {
            expect(storageConfig.getStreamParts().size).toEqual(6)
        })
    })

    describe('on event-based results', () => {
        beforeEach(async () => {
            await storageConfig.start()
            const addToStorageNodeListener = storageEventListeners.get('streamAddedToStorageNode')!
            const removeFromStorageNodeListener = storageEventListeners.get('streamRemovedFromStorageNode')!
            addToStorageNodeListener({
                streamId: toStreamID('stream-1'),
                nodeAddress: CLUSTER_ID,
                blockNumber: 10
            })
            await wait(0)
            addToStorageNodeListener({
                streamId: toStreamID('stream-3'),
                nodeAddress: CLUSTER_ID,
                blockNumber: 15
            })
            await wait(0)
            removeFromStorageNodeListener({
                streamId: toStreamID('stream-1'),
                nodeAddress: CLUSTER_ID,
                blockNumber: 13
            })
            await wait(0)
        })

        it('stream part listeners invoked', () => {
            expect(onStreamPartAdded).toHaveBeenCalledTimes(2 + 1)
            expect(onStreamPartRemoved).toHaveBeenCalledTimes(2)
            expect(onStreamPartAdded.mock.calls).toEqual([
                [parse('stream-1#0')],
                [parse('stream-1#1')],
                [parse('stream-3#0')]
            ])
            expect(onStreamPartRemoved.mock.calls).toEqual([[parse('stream-1#0')], [parse('stream-1#1')]])
        })

        it('state is updated', () => {
            expect(storageConfig.getStreamParts().size).toEqual(1)
        })
    })

    it('updates do not occur if start has not been invoked', async () => {
        getStoredStreams.mockResolvedValue({
            streams: [makeStubStream('stream-1'), makeStubStream('stream-2')],
            blockNumber: 10
        })
        await wait(POLL_TIME * 2)

        expect(storageEventListeners.size).toBe(0)
        expect(getStoredStreams).toHaveBeenCalledTimes(0)
        expect(onStreamPartAdded).toHaveBeenCalledTimes(0)
        expect(onStreamPartRemoved).toHaveBeenCalledTimes(0)
    })

    it('updates do not occur after destroy has been invoked', async () => {
        await storageConfig.start()
        await wait(POLL_TIME)
        storageConfig.destroy()

        getStoredStreams.mockClear()
        getStoredStreams.mockResolvedValue({
            streams: [makeStubStream('stream-1'), makeStubStream('stream-2')],
            blockNumber: 10
        })
        expect(storageEventListeners.size).toBe(0)
        await wait(POLL_TIME * 2)

        expect(getStoredStreams).toHaveBeenCalledTimes(0)
        expect(onStreamPartAdded).toHaveBeenCalledTimes(0)
        expect(onStreamPartRemoved).toHaveBeenCalledTimes(0)
    })
})
