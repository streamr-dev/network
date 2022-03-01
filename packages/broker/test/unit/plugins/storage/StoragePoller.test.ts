import { StoragePoller } from '../../../../src/plugins/storage/StoragePoller'
import { Stream, StreamrClient } from 'streamr-client'
import { wait } from 'streamr-test-utils'
import { EthereumAddress } from 'streamr-client-protocol'

const POLL_TIME = 5

const POLL_RESULT = Object.freeze({
    streams: [
        { id: 'stream-1', partitions: 1 },
        { id: 'stream-2', partitions: 5 },
    ] as Stream[],
    blockNumber: 13
})

describe(StoragePoller, () => {
    let getStoredStreamsOf: jest.Mock<Promise<{ streams: Stream[], blockNumber: number }>, [nodeAddress: EthereumAddress]>
    let onNewSnapshot: jest.Mock<void, [streams: Stream[], block: number]>
    let stubClient: Pick<StreamrClient, 'getStoredStreamsOf'>
    let poller: StoragePoller

    function initPoller(interval: number): StoragePoller {
        return new StoragePoller('clusterId', interval, stubClient as StreamrClient, onNewSnapshot)
    }

    beforeEach(() => {
        getStoredStreamsOf = jest.fn()
        onNewSnapshot = jest.fn()
        stubClient = { getStoredStreamsOf }
        poller = initPoller(POLL_TIME)
    })

    afterEach(() => {
        poller?.destroy()
    })

    describe('poll()', () => {
        beforeEach(async () => {
            getStoredStreamsOf.mockResolvedValueOnce(POLL_RESULT)
            await poller.poll()
        })

        it('stream assignment result set is passed to onNewSnapshot callback', () => {
            expect(onNewSnapshot).toHaveBeenCalledTimes(1)
            expect(onNewSnapshot).toHaveBeenCalledWith(POLL_RESULT.streams, POLL_RESULT.blockNumber)
        })

        it('client.getStoredStreamsOf is invoked with correct argument', () => {
            expect(getStoredStreamsOf).toHaveBeenCalledWith('clusterId')
        })
    })

    it('start() schedules polling on an interval', async () => {
        getStoredStreamsOf.mockResolvedValue(POLL_RESULT)
        await poller.start()
        await wait(POLL_TIME * 10)
        expect(onNewSnapshot.mock.calls.length).toBeGreaterThanOrEqual(4)
    })

    it('start() polls only once if pollInterval=0', async () => {
        getStoredStreamsOf.mockResolvedValue(POLL_RESULT)
        poller = initPoller(0)
        await poller.start()
        await wait(POLL_TIME * 10)
        expect(getStoredStreamsOf).toBeCalledTimes(1)
    })

    it('start() handles polling errors gracefully', async () => {
        getStoredStreamsOf.mockRejectedValue(new Error('poll failed'))
        await poller.start()
        await wait(POLL_TIME * 2)
        expect(onNewSnapshot).toBeCalledTimes(0) // Should not have encountered unhandledRejectionError
    })
})
