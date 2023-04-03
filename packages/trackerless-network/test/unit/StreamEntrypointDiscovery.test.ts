import { StreamEntryPointDiscovery } from '../../src/logic/StreamEntryPointDiscovery'
import { PeerDescriptor, RecursiveFindResult, PeerID } from '@streamr/dht'
import { StreamObject } from '../../src/logic/StreamrNode'
import { DataEntry } from '../../src/proto/packages/dht/protos/DhtRpc'
import { Any } from '../../src/proto/google/protobuf/any'

describe('StreamEntryPointDiscovery', () => {

    let streamEntryPointDiscoveryWithData: StreamEntryPointDiscovery
    let streamEntryPointDiscoveryWithoutData: StreamEntryPointDiscovery
    let storeCalled: number

    const peerDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString('mock').value,
        type: 0,
        nodeName: 'mock'
    }

    const mockData: DataEntry = {
        data: Any.pack(peerDescriptor, PeerDescriptor),
        ttl: 1000,
        storer: peerDescriptor,
        kademliaId: Uint8Array.from([1, 2, 3])
    }

    const stream = 'stream#0'

    const mockGetEntryPointData = async (_key: Uint8Array): Promise<RecursiveFindResult> => {
        return {
            closestNodes: [peerDescriptor],
            dataEntries: [mockData]
        }
    }

    const mockStoreEntryPointData = async (_key: Uint8Array, _data: Any): Promise<PeerDescriptor[]> => {
        storeCalled++
        return [peerDescriptor]
    }

    const emptyGetEntryPointData = async (_key: Uint8Array): Promise<RecursiveFindResult> => {
        return {
            closestNodes: [],
            dataEntries: []
        }
    }

    beforeEach(() => {
        storeCalled = 0
        streamEntryPointDiscoveryWithData = new StreamEntryPointDiscovery({
            ownPeerDescriptor: peerDescriptor,
            streams: new Map<string, StreamObject>(),
            getEntryPointData: mockGetEntryPointData,
            storeEntryPointData: mockStoreEntryPointData
        })
        streamEntryPointDiscoveryWithoutData = new StreamEntryPointDiscovery({
            ownPeerDescriptor: peerDescriptor,
            streams: new Map<string, StreamObject>(),
            getEntryPointData: emptyGetEntryPointData,
            storeEntryPointData: mockStoreEntryPointData
        })
    })

    afterEach(() => {
        streamEntryPointDiscoveryWithData.destroy()
    })

    it('discoverEntryPointsFromDht has known entrypoints', async () => {
        const res = await streamEntryPointDiscoveryWithData.discoverEntryPointsFromDht(stream, 1)
        expect(res.joiningEmptyStream).toEqual(false)
        expect(res.entryPointsFromDht).toEqual(false)
        expect(res.discoveredEntryPoints).toEqual([])
    })

    it('discoverEntryPointsFromDht does not have known entrypoints', async () => {
        const res = await streamEntryPointDiscoveryWithData.discoverEntryPointsFromDht(stream, 0)
        expect(res.joiningEmptyStream).toEqual(false)
        expect(res.entryPointsFromDht).toEqual(true)
        expect(res.discoveredEntryPoints).toEqual([peerDescriptor])
    })

    it('discoverEntryPointsfromDht on an empty stream', async () => {
        const res = await streamEntryPointDiscoveryWithoutData.discoverEntryPointsFromDht(stream, 0)
        expect(res.joiningEmptyStream).toEqual(true)
        expect(res.entryPointsFromDht).toEqual(true)
        expect(res.discoveredEntryPoints).toEqual([peerDescriptor]) // ownPeerDescriptor
    })

    it('store on empty stream', async () => {
        await streamEntryPointDiscoveryWithData.storeSelfAsEntryPointIfNecessary(stream, true, true, 0)
        expect(storeCalled).toEqual(1)
    })

    it('store on non-empty stream without known entry points', async () => {
        await streamEntryPointDiscoveryWithData.storeSelfAsEntryPointIfNecessary(stream, false, false, 0)
        expect(storeCalled).toEqual(0)
    })

    it('store on stream without saturated entrypoint count', async () => {
        await streamEntryPointDiscoveryWithData.storeSelfAsEntryPointIfNecessary(stream, false, true, 0)
        expect(storeCalled).toEqual(1)
    })

})
