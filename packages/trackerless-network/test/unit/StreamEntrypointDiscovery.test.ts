import { StreamEntryPointDiscovery } from '../../src/logic/StreamEntryPointDiscovery'
import { PeerDescriptor, RecursiveFindResult, PeerID } from '@streamr/dht'
import { StreamObject } from '../../src/logic/StreamrNode'
import { DataEntry } from '../../src/proto/packages/dht/protos/DhtRpc'
import { Any } from '../../src/proto/google/protobuf/any'
import { wait } from '@streamr/utils'

describe('StreamEntryPointDiscovery', () => {

    let streamEntryPointDiscoveryWithData: StreamEntryPointDiscovery
    let streamEntryPointDiscoveryWithoutData: StreamEntryPointDiscovery
    let storeCalled: number
    let streams = new Map<string, StreamObject>()

    const peerDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString('fake').value,
        type: 0,
        nodeName: 'fake'
    }

    const deletedPeerDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString('deleted').value,
        type: 0,
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

    const stream = 'stream#0'

    const fakeGetEntryPointData = async (_key: Uint8Array): Promise<RecursiveFindResult> => {
        return {
            closestNodes: [peerDescriptor],
            dataEntries: [fakeData, fakeDeletedData]
        }
    }

    const fakeGetEntryPointDataViaPeer = async (_key: Uint8Array, _peer: PeerDescriptor): Promise<DataEntry[]> => {
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
        streams.set(stream, {} as any)
        streamEntryPointDiscoveryWithData = new StreamEntryPointDiscovery({
            ownPeerDescriptor: peerDescriptor,
            streams,
            getEntryPointData: fakeGetEntryPointData,
            getEntryPointDataViaPeer: fakeGetEntryPointDataViaPeer,
            storeEntryPointData: fakeStoreEntryPointData,
            deleteEntryPointData: fakeDeleteEntryPointData,
            cacheInterval: 2000
        })
        streamEntryPointDiscoveryWithoutData = new StreamEntryPointDiscovery({
            ownPeerDescriptor: peerDescriptor,
            streams: new Map<string, StreamObject>(),
            getEntryPointData: fakeEmptyGetEntryPointData,
            getEntryPointDataViaPeer: fakeGetEntryPointDataViaPeer,
            storeEntryPointData: fakeStoreEntryPointData,
            deleteEntryPointData: fakeDeleteEntryPointData,
            cacheInterval: 2000
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

    it('will keep recaching until stream stopped', async () => {
        await streamEntryPointDiscoveryWithData.storeSelfAsEntryPointIfNecessary(stream, true, true, 0)
        expect(storeCalled).toEqual(1)
        await wait(4500)
        streamEntryPointDiscoveryWithData.removeSelfAsEntryPoint(stream)
        expect(storeCalled).toEqual(3)
    })

    it('will stop recaching is stream is left', async () => {
        await streamEntryPointDiscoveryWithData.storeSelfAsEntryPointIfNecessary(stream, true, true, 0)
        expect(storeCalled).toEqual(1)
        streams.delete(stream)
        await wait(4500)
        expect(storeCalled).toEqual(1)
    })

})
