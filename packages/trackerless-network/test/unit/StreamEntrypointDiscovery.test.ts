import { StreamEntryPointDiscovery } from '../../src/logic/StreamEntryPointDiscovery'
import { PeerDescriptor, RecursiveFindResult } from '@streamr/dht'
import { PeerID } from '../..'
import { StreamObject } from '../../src/logic/StreamrNode'
import { DataEntry } from '../../src/proto/packages/dht/protos/DhtRpc'
import { Any } from '../../src/proto/google/protobuf/any'


describe('StreamEntryPointDiscovery', () => {

    let streamEntryPointDiscoveryWithData: StreamEntryPointDiscovery
    let streamEntryPointDiscoveryWithoutData: StreamEntryPointDiscovery

    const peerDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString('mock').value,
        type: 0,
        nodeName: 'mock'
    }

    const mockData: DataEntry = {
        data: Any.pack(peerDescriptor, PeerDescriptor),
        ttl: 1000,
        storer: peerDescriptor
    }

    const stream = 'stream#0'

    const mockGetEntryPointData = async (_key: Uint8Array): Promise<RecursiveFindResult> => {
        return {
            closestNodes: [peerDescriptor],
            dataEntries: [mockData]
        }
    }

    const mockStoreEntryPointData = async (_key: Uint8Array, _data: Any): Promise<PeerDescriptor[]> => {
        return [peerDescriptor]
    }

    const emptyGetEntryPointData = async (_key: Uint8Array): Promise<RecursiveFindResult> => {
        return {
            closestNodes: [peerDescriptor],
            dataEntries: [mockData]
        }
    }

    const emptyStoreEntryPointData = async (_key: Uint8Array, _data: Any): Promise<PeerDescriptor[]> => {
        return [peerDescriptor]
    }

    beforeEach(() => {
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
            storeEntryPointData: emptyStoreEntryPointData
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

    it('', async () => {

    })
})