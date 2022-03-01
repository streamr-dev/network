import { StorageConfig } from '../../../../src/plugins/storage/StorageConfig'
import { StorageNodeAssignmentEvent, Stream, StreamrClient } from 'streamr-client'
import { EthereumAddress, StreamPartID, StreamPartIDUtils, toStreamID} from 'streamr-client-protocol'
import { wait } from 'streamr-test-utils'

const { parse } = StreamPartIDUtils

const POLL_TIME = 10

const PARTITION_COUNT_LOOKUP: Record<string, number> = Object.freeze({
    'stream-1': 2,
    'stream-2': 4,
    'stream-3': 1
})

function makeStubStream(streamId: string): Stream {
    return {
        id: toStreamID(streamId),
        partitions: PARTITION_COUNT_LOOKUP[streamId]
    } as Stream
}

describe(StorageConfig, () => {
    let getStoredStreamsOf: jest.Mock<Promise<{ streams: Stream[], blockNumber: number }>, [nodeAddress: EthereumAddress]>
    let storageEventListener: ((event: StorageNodeAssignmentEvent) => any) | undefined
    let stubClient: Pick<StreamrClient, 'getStream'
        | 'getStoredStreamsOf'
        | 'registerStorageEventListener'
        | 'unRegisterStorageEventListeners' >
    let onStreamPartAdded: jest.Mock<void, [StreamPartID]>
    let onStreamPartRemoved: jest.Mock<void, [StreamPartID]>
    let storageConfig: StorageConfig

    beforeEach(async () => {
        getStoredStreamsOf = jest.fn()
        storageEventListener = undefined
        stubClient = {
            getStoredStreamsOf,
            async getStream(streamIdOrPath: string) {
                return makeStubStream(streamIdOrPath, )
            },
            async registerStorageEventListener(cb: (event: StorageNodeAssignmentEvent) => any) {
                storageEventListener = cb
            },
            unRegisterStorageEventListeners: async () => {
                storageEventListener = undefined
            }
        }
        onStreamPartAdded = jest.fn()
        onStreamPartRemoved = jest.fn()
        storageConfig = new StorageConfig('clusterId', 1, 0, POLL_TIME, stubClient as StreamrClient, {
            onStreamPartAdded,
            onStreamPartRemoved
        })
        getStoredStreamsOf.mockRejectedValue(new Error('results not available'))
    })

    afterEach(async () => {
        await storageConfig?.destroy()
    })

    it('state starts empty', () => {
        expect(storageConfig.getStreamParts()).toBeEmpty()
    })

    describe('on polled results', () => {
        beforeEach(async () => {
            getStoredStreamsOf.mockResolvedValue({
                streams: [
                    makeStubStream('stream-1'),
                    makeStubStream('stream-2')
                ],
                blockNumber: 10
            })
            await storageConfig.start()
            await wait(POLL_TIME * 2)
        })

        it('stream part listeners invoked', () => {
            expect(onStreamPartAdded).toBeCalledTimes(6)
            expect(onStreamPartRemoved).toBeCalledTimes(0)
            expect(onStreamPartAdded.mock.calls).toEqual([
                [parse('stream-1#0')],
                [parse('stream-1#1')],
                [parse('stream-2#0')],
                [parse('stream-2#1')],
                [parse('stream-2#2')],
                [parse('stream-2#3')],
            ])
        })

        it('state is updated', () => {
            expect(storageConfig.getStreamParts().size).toEqual(6)
        })
    })

    describe('on event-based results', () => {
        beforeEach(async () => {
            await storageConfig.start()
            storageEventListener!({
                streamId: 'stream-1',
                nodeAddress: 'clusterId',
                type: 'added',
                blockNumber: 10,
            })
            await wait(0)
            storageEventListener!({
                streamId: 'stream-3',
                nodeAddress: 'clusterId',
                type: 'added',
                blockNumber: 15,
            })
            await wait(0)
            storageEventListener!({
                streamId: 'stream-1',
                nodeAddress: 'clusterId',
                type: 'removed',
                blockNumber: 13,
            })
            await wait(0)
        })

        it('stream part listeners invoked', () => {
            expect(onStreamPartAdded).toBeCalledTimes(2 + 1)
            expect(onStreamPartRemoved).toBeCalledTimes(2)
            expect(onStreamPartAdded.mock.calls).toEqual([
                [parse('stream-1#0')],
                [parse('stream-1#1')],
                [parse('stream-3#0')],
            ])
            expect(onStreamPartRemoved.mock.calls).toEqual([
                [parse('stream-1#0')],
                [parse('stream-1#1')],
            ])
        })

        it('state is updated', () => {
            expect(storageConfig.getStreamParts().size).toEqual(1)
        })
    })

    it('updates do not occur if start has not been invoked', async () => {
        getStoredStreamsOf.mockResolvedValue({
            streams: [
                makeStubStream('stream-1'),
                makeStubStream('stream-2')
            ],
            blockNumber: 10
        })
        await wait(POLL_TIME * 2)

        expect(storageEventListener).toBeUndefined()
        expect(getStoredStreamsOf).toHaveBeenCalledTimes(0)
        expect(onStreamPartAdded).toHaveBeenCalledTimes(0)
        expect(onStreamPartRemoved).toHaveBeenCalledTimes(0)
    })

    it('updates do not occur after destroy has been invoked', async () => {
        await storageConfig.start()
        await wait(POLL_TIME)
        await storageConfig.destroy()

        getStoredStreamsOf.mockClear()
        getStoredStreamsOf.mockResolvedValue({
            streams: [
                makeStubStream('stream-1'),
                makeStubStream('stream-2')
            ],
            blockNumber: 10
        })
        expect(storageEventListener).toBeUndefined()
        await wait(POLL_TIME * 2)

        expect(getStoredStreamsOf).toHaveBeenCalledTimes(0)
        expect(onStreamPartAdded).toHaveBeenCalledTimes(0)
        expect(onStreamPartRemoved).toHaveBeenCalledTimes(0)
    })
})
