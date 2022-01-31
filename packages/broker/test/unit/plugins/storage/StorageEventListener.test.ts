import { StorageEventListener } from '../../../../src/plugins/storage/StorageEventListener'
import { EthereumStorageEvent, Stream, StreamrClient } from 'streamr-client'
import { afterEach } from 'jest-circus'
import { wait } from 'streamr-test-utils'

describe(StorageEventListener, () => {
    let stubClient: Pick<StreamrClient, 'getStream'
        | 'registerStorageEventListener'
        | 'unRegisterStorageEventListeners'>
    let storageEventListener: ((event: EthereumStorageEvent) => any) | undefined
    let handleEvent: jest.Mock<void, [stream: Stream, type: 'added' | 'removed', block: number]>
    let listener: StorageEventListener

    beforeEach(() => {
        stubClient = {
            async getStream() {
                return {
                    id: 'streamId',
                    partitions: 0
                } as Stream
            },
            async registerStorageEventListener(cb: (arg0: EthereumStorageEvent) => any): Promise<void> {
                storageEventListener = cb
            },
            unRegisterStorageEventListeners: jest.fn()
        }
        storageEventListener = undefined
        handleEvent = jest.fn()
        listener = new StorageEventListener('clusterId', stubClient as StreamrClient, handleEvent)
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
        expect(stubClient.unRegisterStorageEventListeners).toHaveBeenCalledTimes(0)
        await listener.destroy()
        expect(stubClient.unRegisterStorageEventListeners).toHaveBeenCalledTimes(1)
    })

    function assignStorageNode(recipient: string) {
        storageEventListener!({
            nodeAddress: recipient,
            streamId: 'streamId',
            type: 'added',
            blockNumber: 8694
        })
    }

    it('storage node assignment event gets passed to handleEvent', async () => {
        await listener.start()
        assignStorageNode('clusterId')
        await wait(0)
        expect(handleEvent).toHaveBeenCalledTimes(1)
        expect(handleEvent).toHaveBeenCalledWith(
            { id: 'streamId', partitions: 0 },
            'added',
            8694
        )
    })

    it('storage node assignment events meant for another recipient are ignored', async () => {
        await listener.start()
        assignStorageNode('otherClusterId')
        await wait(0)
        expect(handleEvent).toHaveBeenCalledTimes(0)
    })
})
