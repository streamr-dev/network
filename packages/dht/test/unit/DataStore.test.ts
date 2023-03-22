import { DataStore } from '../../src/dht/store/DataStore'
import { MockRecursiveFinder } from '../utils/mock/RecursiveFinder'
import { MockRouter } from '../utils/mock/Router'
import { PeerDescriptor, StoreDataRequest } from '../../src/proto/packages/dht/protos/DhtRpc'
import { LocalDataStore } from '../../src/dht/store/LocalDataStore'
import { createMockRoutingRpcCommunicator } from '../utils/utils'
import { PeerID } from '../../src/helpers/PeerID'
import { Any } from '../../src/proto/google/protobuf/any'
import { expect } from 'expect'

describe('DataStore', () => {

    const peerId = PeerID.fromString('peerid')
    const peerDescriptor: PeerDescriptor = {
        kademliaId: peerId.value,
        type: 0,
        nodeName: 'peerid'
    }
    const data = Any.pack(peerDescriptor, PeerDescriptor)

    let dataStore: DataStore

    beforeEach(() => {
        dataStore = new DataStore({
            recursiveFinder: new MockRecursiveFinder(),
            router: new MockRouter(),
            serviceId: 'store',
            ownPeerDescriptor: peerDescriptor,
            localDataStore: new LocalDataStore(),
            rpcCommunicator: createMockRoutingRpcCommunicator(),
            storeMaxTtl: 100,
            storeNumberOfCopies: 2,
            storeHighestTtl: 100
        })
    })

    it('DataStore server', async () => {
        const request: StoreDataRequest = {
            data,
            kademliaId: peerId.value,
            ttl: 100
        }
        const res = await dataStore.storeData(request, { incomingSourceDescriptor: peerDescriptor } as any)
        expect(res.error).toEqual('')
    })

    it('storeDataToDht', async () => {
        const res = await dataStore.storeDataToDht(peerId.value, data)
        expect(res).toEqual([])
    })

})
