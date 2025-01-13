import { StoragePoller } from '../../../../src/plugins/storage/StoragePoller'
import { Stream, StreamrClient } from '@streamr/sdk'
import { EthereumAddress, wait } from '@streamr/utils'

const POLL_TIME = 5

const POLL_RESULT = Object.freeze({
    streams: [{ id: 'stream-1' }, { id: 'stream-2' }] as Stream[],
    blockNumber: 13
})

describe(StoragePoller, () => {
    let getStoredStreams: jest.Mock<Promise<{ streams: Stream[]; blockNumber: number }>, [nodeAddress: EthereumAddress]>
    let onNewSnapshot: jest.Mock<Promise<void>, [streams: Stream[], block: number]>
    let stubClient: Pick<StreamrClient, 'getStoredStreams'>
    let poller: StoragePoller
    let abortController: AbortController

    function initPoller(interval: number): StoragePoller {
        return new StoragePoller('clusterId', interval, stubClient as StreamrClient, onNewSnapshot)
    }

    beforeEach(() => {
        getStoredStreams = jest.fn()
        onNewSnapshot = jest.fn()
        stubClient = { getStoredStreams }
        poller = initPoller(POLL_TIME)
        abortController = new AbortController()
    })

    afterEach(() => {
        abortController.abort()
    })

    describe('poll()', () => {
        beforeEach(async () => {
            getStoredStreams.mockResolvedValueOnce(POLL_RESULT)
            await poller.poll()
        })

        it('stream assignment result set is passed to onNewSnapshot callback', () => {
            expect(onNewSnapshot).toHaveBeenCalledTimes(1)
            expect(onNewSnapshot).toHaveBeenCalledWith(POLL_RESULT.streams, POLL_RESULT.blockNumber)
        })

        it('client.getStoredStreams is invoked with correct argument', () => {
            expect(getStoredStreams).toHaveBeenCalledWith('clusterId')
        })
    })

    it('start() schedules polling on an interval', async () => {
        getStoredStreams.mockResolvedValue(POLL_RESULT)
        await poller.start(abortController.signal)
        await wait(POLL_TIME * 10)
        expect(onNewSnapshot.mock.calls.length).toBeGreaterThanOrEqual(4)
    })

    it('start() polls only once if pollInterval=0', async () => {
        getStoredStreams.mockResolvedValue(POLL_RESULT)
        poller = initPoller(0)
        await poller.start(abortController.signal)
        await wait(POLL_TIME * 10)
        expect(getStoredStreams).toHaveBeenCalledTimes(1)
    })

    it('start() handles polling errors gracefully', async () => {
        getStoredStreams.mockRejectedValue(new Error('poll failed'))
        await poller.start(abortController.signal)
        await wait(POLL_TIME * 2)
        expect(onNewSnapshot).toHaveBeenCalledTimes(0) // Should not have encountered unhandledRejectionError
    })
})
