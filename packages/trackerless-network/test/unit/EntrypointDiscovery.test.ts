import { PeerDescriptor, areEqualPeerDescriptors } from '@streamr/dht'
import { StreamPartIDUtils } from '@streamr/protocol'
import { wait } from '@streamr/utils'
import { range } from 'lodash'
import { EntryPointDiscovery } from '../../src/logic/EntryPointDiscovery'
import { Any } from '../../src/proto/google/protobuf/any'
import { DataEntry } from '../../src/proto/packages/dht/protos/DhtRpc'
import { MockLayer1Node } from '../utils/mock/MockLayer1Node'
import { createMockPeerDescriptor } from '../utils/utils'

const STREAM_PART_ID = StreamPartIDUtils.parse('stream#0')

describe('EntryPointDiscovery', () => {

    let entryPointDiscoveryWithData: EntryPointDiscovery
    let entryPointDiscoveryWithoutData: EntryPointDiscovery
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

    const addNodesToStreamPart = (layer1: MockLayer1Node, count: number) => {
        range(count).forEach(() => {
            layer1.addNewRandomPeerToKBucket()
            layer1.addNewRandomPeerToKBucket()
            layer1.addNewRandomPeerToKBucket()
            layer1.addNewRandomPeerToKBucket()
        })
    } 

    let layer1Node: MockLayer1Node

    beforeEach(() => {
        storeCalled = 0
        layer1Node = new MockLayer1Node()
        entryPointDiscoveryWithData = new EntryPointDiscovery({
            localPeerDescriptor: peerDescriptor,
            streamPartId: STREAM_PART_ID,
            layer1Node,
            fetchEntryPointData: fakeFetchEntryPointData,
            storeEntryPointData: fakeStoreEntryPointData,
            deleteEntryPointData: fakeDeleteEntryPointData,
            storeInterval: 2000
        })
        entryPointDiscoveryWithoutData = new EntryPointDiscovery({
            localPeerDescriptor: peerDescriptor,
            streamPartId: STREAM_PART_ID,
            layer1Node,
            fetchEntryPointData: fakeEmptyFetchEntryPointData,
            storeEntryPointData: fakeStoreEntryPointData,
            deleteEntryPointData: fakeDeleteEntryPointData,
            storeInterval: 2000
        })
    })

    afterEach(() => {
        entryPointDiscoveryWithData.destroy()
    })

    it('discoverEntryPointsFromDht has known entrypoints', async () => {
        const res = await entryPointDiscoveryWithData.discoverEntryPointsFromDht(1)
        expect(res.entryPointsFromDht).toEqual(false)
        expect(res.discoveredEntryPoints).toEqual([])
    })

    it('discoverEntryPointsFromDht does not have known entrypoints', async () => {
        const res = await entryPointDiscoveryWithData.discoverEntryPointsFromDht(0)
        expect(res.discoveredEntryPoints.length).toBe(1)
        expect(areEqualPeerDescriptors(res.discoveredEntryPoints[0], peerDescriptor)).toBe(true)
    })

    it('discoverEntryPointsfromDht on an empty stream', async () => {
        const res = await entryPointDiscoveryWithoutData.discoverEntryPointsFromDht(0)
        expect(res.entryPointsFromDht).toEqual(true)
        expect(res.discoveredEntryPoints.length).toBe(1)
        expect(areEqualPeerDescriptors(res.discoveredEntryPoints[0], peerDescriptor)).toBe(true)  // localPeerDescriptor
    })

    it('store on empty stream', async () => {
        await entryPointDiscoveryWithData.storeSelfAsEntryPointIfNecessary(0)
        expect(storeCalled).toEqual(1)
        expect(entryPointDiscoveryWithData.isLocalNodeEntryPoint()).toEqual(true)
    })

    it('store on stream without saturated entrypoint count', async () => {
        addNodesToStreamPart(layer1Node, 4)
        await entryPointDiscoveryWithData.storeSelfAsEntryPointIfNecessary(0)
        expect(storeCalled).toEqual(1)
        expect(entryPointDiscoveryWithData.isLocalNodeEntryPoint()).toEqual(true)
    })

    it('will keep stored until destroyed', async () => {
        await entryPointDiscoveryWithData.storeSelfAsEntryPointIfNecessary(0)
        expect(storeCalled).toEqual(1)
        expect(entryPointDiscoveryWithData.isLocalNodeEntryPoint()).toEqual(true)
        await wait(4500)
        await entryPointDiscoveryWithData.destroy()
        // we have configured storeInterval to 2 seconds, i.e. after 4.5 seconds it should have been called 2 more items 
        expect(storeCalled).toEqual(3)
    })

})
