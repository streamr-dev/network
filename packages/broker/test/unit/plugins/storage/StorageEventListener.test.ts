import { StorageEventListener } from '../../../../src/plugins/storage/StorageEventListener'
import { StorageNodeAssignmentEvent, Stream, StreamrClient } from 'streamr-client'
import { afterEach } from 'jest-circus'
import { wait } from 'streamr-test-utils'

describe(StorageEventListener, () => {
    let stubClient: Pick<StreamrClient, 'getStream'
        | 'registerStorageEventListener'
        | 'unregisterStorageEventListeners'>
    let storageEventListener: ((event: StorageNodeAssignmentEvent) => any) | undefined
    let onEvent: jest.Mock<void, [stream: Stream, type: 'added' | 'removed', block: number]>
    let listener: StorageEventListener

    beforeEach(() => {
        stubClient = {
            async getStream() {
                return {
                    id: 'streamId',
                    partitions: 3
                } as Stream
            },
            async registerStorageEventListener(cb: (event: StorageNodeAssignmentEvent) => any): Promise<void> {
                storageEventListener = cb
            },
            unregisterStorageEventListeners: jest.fn()
        }
        storageEventListener = undefined
        onEvent = jest.fn()
        listener = new StorageEventListener('clusterId', stubClient as StreamrClient, onEvent)
    })

    afterEach(() => {
        listener?.destroy()
    })

    it('start() registers storage event listener on client', async () => {
        expect(storageEventListener).toBeUndefined()
        await listener.start()
        expect(storageEventListener).toBeDefined()
    })

    it('destroy() unregisters storage event listener on client', async () => {
        expect(stubClient.unregisterStorageEventListeners).toHaveBeenCalledTimes(0)
        await listener.destroy()
        expect(stubClient.unregisterStorageEventListeners).toHaveBeenCalledTimes(1)
    })

    function assignStorageNode(recipient: string) {
        storageEventListener!({
            nodeAddress: recipient,
            streamId: 'streamId',
            type: 'added',
            blockNumber: 8694
        })
    }

    it('storage node assignment event gets passed to onEvent', async () => {
        await listener.start()
        assignStorageNode('clusterId')
        await wait(0)
        expect(onEvent).toHaveBeenCalledTimes(1)
        expect(onEvent).toHaveBeenCalledWith(
            { id: 'streamId', partitions: 3 },
            'added',
            8694
        )
    })

    it('storage node assignment events meant for another recipient are ignored', async () => {
        await listener.start()
        assignStorageNode('otherClusterId')
        await wait(0)
        expect(onEvent).toHaveBeenCalledTimes(0)
    })
})
