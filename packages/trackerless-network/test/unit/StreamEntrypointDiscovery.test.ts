import { StreamEntryPointDiscovery } from '../../src/logic/StreamEntryPointDiscovery'
import { PeerDescriptor, isSamePeerDescriptor, RecursiveFindResult } from '@streamr/dht'
import { StreamObject } from '../../src/logic/StreamrNode'
import { DataEntry } from '../../src/proto/packages/dht/protos/DhtRpc'
import { Any } from '../../src/proto/google/protobuf/any'
import { hexToBinary, wait } from '@streamr/utils'
import { StreamPartIDUtils } from '@streamr/protocol'
import { createRandomNodeId } from '../utils/utils'

describe('StreamEntryPointDiscovery', () => {

    let streamEntryPointDiscoveryWithData: StreamEntryPointDiscovery
    let streamEntryPointDiscoveryWithoutData: StreamEntryPointDiscovery
    let storeCalled: number
    let streams = new Map<string, StreamObject>()

    const peerDescriptor: PeerDescriptor = {
        kademliaId: hexToBinary(createRandomNodeId()),
        nodeName: 'fake'
    }

    const deletedPeerDescriptor: PeerDescriptor = {
        kademliaId: hexToBinary(createRandomNodeId()),
        nodeName: 'deleted'
    }

    const fakeData: DataEntry = {
        data: Any.pack(peerDescriptor, PeerDescriptor),
        ttl: 1000,
        storer: peerDescriptor,
        kademliaId: Uint8Array.from([1, 2, 3]),
        stale: false,
        deleted: false
    }

    const fakeDeletedData: DataEntry = {
        data: Any.pack(deletedPeerDescriptor, PeerDescriptor),
        ttl: 1000,
        storer: deletedPeerDescriptor,
        kademliaId: Uint8Array.from([1, 2, 3]),
        stale: false,
        deleted: true
    }

    const streamPartId = StreamPartIDUtils.parse('stream#0')

    const fakeGetEntryPointData = async (_key: Uint8Array): Promise<RecursiveFindResult> => {
        return {
            closestNodes: [peerDescriptor],
            dataEntries: [fakeData, fakeDeletedData]
        }
    }

    const fakegetEntryPointDataViaNode = async (_key: Uint8Array, _node: PeerDescriptor): Promise<DataEntry[]> => {
        return [fakeData]
    }

    const fakeStoreEntryPointData = async (_key: Uint8Array, _data: Any): Promise<PeerDescriptor[]> => {
        storeCalled++
        return [peerDescriptor]
    }

    const fakeEmptyGetEntryPointData = async (_key: Uint8Array): Promise<RecursiveFindResult> => {
        return {
            closestNodes: [],
            dataEntries: []
        }
    }

    const fakeDeleteEntryPointData = async (_key: Uint8Array): Promise<void> => {}

    beforeEach(() => {
        storeCalled = 0
        streams = new Map()
        streams.set(streamPartId, {} as any)
        streamEntryPointDiscoveryWithData = new StreamEntryPointDiscovery({
            ownPeerDescriptor: peerDescriptor,
            streams,
            getEntryPointData: fakeGetEntryPointData,
            getEntryPointDataViaNode: fakegetEntryPointDataViaNode,
            storeEntryPointData: fakeStoreEntryPointData,
            deleteEntryPointData: fakeDeleteEntryPointData,
            cacheInterval: 2000
        })
        streamEntryPointDiscoveryWithoutData = new StreamEntryPointDiscovery({
            ownPeerDescriptor: peerDescriptor,
            streams: new Map<string, StreamObject>(),
            getEntryPointData: fakeEmptyGetEntryPointData,
            getEntryPointDataViaNode: fakegetEntryPointDataViaNode,
            storeEntryPointData: fakeStoreEntryPointData,
            deleteEntryPointData: fakeDeleteEntryPointData,
            cacheInterval: 2000
        })
    })

    afterEach(() => {
        streamEntryPointDiscoveryWithData.destroy()
    })

    it('discoverEntryPointsFromDht has known entrypoints', async () => {
        const res = await streamEntryPointDiscoveryWithData.discoverEntryPointsFromDht(streamPartId, 1)
        expect(res.joiningEmptyStream).toEqual(false)
        expect(res.entryPointsFromDht).toEqual(false)
        expect(res.discoveredEntryPoints).toEqual([])
    })

    it('discoverEntryPointsFromDht does not have known entrypoints', async () => {
        const res = await streamEntryPointDiscoveryWithData.discoverEntryPointsFromDht(streamPartId, 0)
        expect(res.discoveredEntryPoints.length).toBe(1)
        expect(isSamePeerDescriptor(res.discoveredEntryPoints[0], peerDescriptor)).toBe(true)
    })

    it('discoverEntryPointsfromDht on an empty stream', async () => {
        const res = await streamEntryPointDiscoveryWithoutData.discoverEntryPointsFromDht(streamPartId, 0)
        expect(res.joiningEmptyStream).toEqual(true)
        expect(res.entryPointsFromDht).toEqual(true)
        expect(res.discoveredEntryPoints.length).toBe(1)
        expect(isSamePeerDescriptor(res.discoveredEntryPoints[0], peerDescriptor)).toBe(true)  // ownPeerDescriptor
    })

    it('store on empty stream', async () => {
        await streamEntryPointDiscoveryWithData.storeSelfAsEntryPointIfNecessary(streamPartId, true, true, 0)
        expect(storeCalled).toEqual(1)
    })

    it('store on non-empty stream without known entry points', async () => {
        await streamEntryPointDiscoveryWithData.storeSelfAsEntryPointIfNecessary(streamPartId, false, false, 0)
        expect(storeCalled).toEqual(0)
    })

    it('store on stream without saturated entrypoint count', async () => {
        await streamEntryPointDiscoveryWithData.storeSelfAsEntryPointIfNecessary(streamPartId, false, true, 0)
        expect(storeCalled).toEqual(1)
    })

    it('will keep recaching until stream stopped', async () => {
        await streamEntryPointDiscoveryWithData.storeSelfAsEntryPointIfNecessary(streamPartId, true, true, 0)
        expect(storeCalled).toEqual(1)
        await wait(4500)
        streamEntryPointDiscoveryWithData.removeSelfAsEntryPoint(streamPartId)
        expect(storeCalled).toEqual(3)
    })

    it('will stop recaching is stream is left', async () => {
        await streamEntryPointDiscoveryWithData.storeSelfAsEntryPointIfNecessary(streamPartId, true, true, 0)
        expect(storeCalled).toEqual(1)
        streams.delete(streamPartId)
        await wait(4500)
        expect(storeCalled).toEqual(1)
    })

})
