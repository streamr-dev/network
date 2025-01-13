import { PeerDescriptor, areEqualPeerDescriptors, randomDhtAddress } from '@streamr/dht'
import { wait } from '@streamr/utils'
import { PeerDescriptorStoreManager } from '../../src/logic/PeerDescriptorStoreManager'
import { Any } from '../../generated/google/protobuf/any'
import { DataEntry } from '../../generated/packages/dht/protos/DhtRpc'
import { createMockPeerDescriptor } from '../utils/utils'

const KEY = randomDhtAddress()

describe('PeerDescriptorStoreManager', () => {
    let withData: PeerDescriptorStoreManager
    let withoutData: PeerDescriptorStoreManager
    let storeCalled: number

    const peerDescriptor = createMockPeerDescriptor()
    const deletedPeerDescriptor = createMockPeerDescriptor()

    const fakeData: DataEntry = {
        key: Uint8Array.from([1, 2, 3]),
        data: Any.pack(peerDescriptor, PeerDescriptor),
        creator: peerDescriptor.nodeId,
        ttl: 1000,
        stale: false,
        deleted: false
    }

    const fakeDeletedData: DataEntry = {
        key: Uint8Array.from([1, 2, 3]),
        data: Any.pack(deletedPeerDescriptor, PeerDescriptor),
        creator: deletedPeerDescriptor.nodeId,
        ttl: 1000,
        stale: false,
        deleted: true
    }

    const fakeFetchDataFromDht = async (): Promise<DataEntry[]> => {
        return [fakeData, fakeDeletedData]
    }

    const fakeStoreDataToDht = async (): Promise<PeerDescriptor[]> => {
        storeCalled++
        return [peerDescriptor]
    }

    const fakeEmptyFetchDataFromDht = async (): Promise<DataEntry[]> => {
        return []
    }

    const fakeDeleteDataFromDht = async (): Promise<void> => {}

    beforeEach(() => {
        storeCalled = 0
        withData = new PeerDescriptorStoreManager({
            localPeerDescriptor: peerDescriptor,
            key: KEY,
            fetchDataFromDht: fakeFetchDataFromDht,
            storeDataToDht: fakeStoreDataToDht,
            deleteDataFromDht: fakeDeleteDataFromDht,
            storeInterval: 2000
        })
        withoutData = new PeerDescriptorStoreManager({
            localPeerDescriptor: peerDescriptor,
            key: KEY,
            fetchDataFromDht: fakeEmptyFetchDataFromDht,
            storeDataToDht: fakeStoreDataToDht,
            deleteDataFromDht: fakeDeleteDataFromDht,
            storeInterval: 2000
        })
    })

    afterEach(() => {
        withData.destroy()
    })

    it('discoverEntryPoints filters deleted data', async () => {
        const res = await withData.fetchNodes()
        expect(res.length).toBe(1)
        expect(areEqualPeerDescriptors(res[0], peerDescriptor)).toBe(true)
    })

    it('discoverEntryPoints without results', async () => {
        const res = await withoutData.fetchNodes()
        expect(res.length).toBe(0)
    })

    it('store on stream without saturated entrypoint count', async () => {
        await withData.storeAndKeepLocalNode()
        expect(storeCalled).toEqual(1)
        expect(withData.isLocalNodeStored()).toEqual(true)
    })

    it('will keep stored until destroyed', async () => {
        await withData.storeAndKeepLocalNode()
        expect(storeCalled).toEqual(1)
        expect(withData.isLocalNodeStored()).toEqual(true)
        await wait(4500)
        await withData.destroy()
        // we have configured storeInterval to 2 seconds, i.e. after 4.5 seconds it should have been called 2 more items
        expect(storeCalled).toEqual(3)
    })
})
