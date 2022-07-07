import { StorageEventListener } from '../../../../src/plugins/storage/StorageEventListener'
import { StorageNodeAssignmentEvent, Stream, StreamrClient, StreamrClientEvents } from 'streamr-client'
import { afterEach } from 'jest-circus'
import { wait } from '@streamr/utils'

describe(StorageEventListener, () => {
    let stubClient: Pick<StreamrClient, 'getStream' | 'on' | 'off'>
    const storageEventListeners: Map<keyof StreamrClientEvents, ((event: StorageNodeAssignmentEvent) => any)> = new Map()
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
            on(eventName: keyof StreamrClientEvents, listener: any) {
                storageEventListeners.set(eventName, listener)
            },
            off: jest.fn()
        }
        onEvent = jest.fn()
        listener = new StorageEventListener('clusterId', stubClient as StreamrClient, onEvent)
    })

    afterEach(() => {
        listener?.destroy()
    })

    it('start() registers storage event listener on client', async () => {
        expect(storageEventListeners.size).toBe(0)
        await listener.start()
        expect(storageEventListeners.size).toBe(2)
    })

    it('destroy() unregisters storage event listener on client', async () => {
        expect(stubClient.off).toHaveBeenCalledTimes(0)
        await listener.destroy()
        expect(stubClient.off).toHaveBeenCalledTimes(2)
    })

    function addToStorageNode(recipient: string) {
        storageEventListeners.get('addToStorageNode')!({
            nodeAddress: recipient,
            streamId: 'streamId',
            blockNumber: 1234
        })
    }

    it('storage node assignment event gets passed to onEvent', async () => {
        await listener.start()
        addToStorageNode('clusterId')
        await wait(0)
        expect(onEvent).toHaveBeenCalledTimes(1)
        expect(onEvent).toHaveBeenCalledWith(
            { id: 'streamId', partitions: 3 },
            'added',
            1234
        )
    })

    it('storage node assignment events meant for another recipient are ignored', async () => {
        await listener.start()
        addToStorageNode('otherClusterId')
        await wait(0)
        expect(onEvent).toHaveBeenCalledTimes(0)
    })
})
