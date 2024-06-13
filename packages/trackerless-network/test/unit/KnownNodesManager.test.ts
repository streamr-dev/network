import { PeerDescriptor, areEqualPeerDescriptors } from '@streamr/dht'
import { StreamPartIDUtils } from '@streamr/protocol'
import { wait } from '@streamr/utils'
import { KnownNodesManager } from '../../src/logic/KnownNodesManager'
import { Any } from '../../src/proto/google/protobuf/any'
import { DataEntry } from '../../src/proto/packages/dht/protos/DhtRpc'
import { createMockPeerDescriptor } from '../utils/utils'

const STREAM_PART_ID = StreamPartIDUtils.parse('stream#0')

describe('KnownNodesManager', () => {

    let managerWithData: KnownNodesManager
    let managerWithoutData: KnownNodesManager
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

    const fakeFetchEntryPointData = async (): Promise<DataEntry[]> => {
        return [fakeData, fakeDeletedData]
    }

    const fakeStoreEntryPointData = async (): Promise<PeerDescriptor[]> => {
        storeCalled++
        return [peerDescriptor]
    }

    const fakeEmptyFetchEntryPointData = async (): Promise<DataEntry[]> => {
        return []
    }

    const fakeDeleteEntryPointData = async (): Promise<void> => {}

    beforeEach(() => {
        storeCalled = 0
        managerWithData = new KnownNodesManager({
            localPeerDescriptor: peerDescriptor,
            streamPartId: STREAM_PART_ID,
            fetchEntryPointData: fakeFetchEntryPointData,
            storeEntryPointData: fakeStoreEntryPointData,
            deleteEntryPointData: fakeDeleteEntryPointData,
            storeInterval: 2000
        })
        managerWithoutData = new KnownNodesManager({
            localPeerDescriptor: peerDescriptor,
            streamPartId: STREAM_PART_ID,
            fetchEntryPointData: fakeEmptyFetchEntryPointData,
            storeEntryPointData: fakeStoreEntryPointData,
            deleteEntryPointData: fakeDeleteEntryPointData,
            storeInterval: 2000
        })
    })

    afterEach(() => {
        managerWithData.destroy()
    })

    it('discoverEntryPoints filters deleted data', async () => {
        const res = await managerWithData.discoverNodes()
        expect(res.length).toBe(1)
        expect(areEqualPeerDescriptors(res[0], peerDescriptor)).toBe(true)
    })

    it('discoverEntryPoints without results', async () => {
        const res = await managerWithoutData.discoverNodes()
        expect(res.length).toBe(0)
    })

    it('store on stream without saturated entrypoint count', async () => {
        await managerWithData.storeAndKeepLocalNodeAsEntryPoint()
        expect(storeCalled).toEqual(1)
        expect(managerWithData.isLocalNodeStored()).toEqual(true)
    })

    it('will keep stored until destroyed', async () => {
        await managerWithData.storeAndKeepLocalNodeAsEntryPoint()
        expect(storeCalled).toEqual(1)
        expect(managerWithData.isLocalNodeStored()).toEqual(true)
        await wait(4500)
        await managerWithData.destroy()
        // we have configured storeInterval to 2 seconds, i.e. after 4.5 seconds it should have been called 2 more items 
        expect(storeCalled).toEqual(3)
    })

})
