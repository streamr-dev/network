import { RpcCommunicator, toProtoRpcClient } from '@streamr/proto-rpc'
import {
    PeerDescriptor,
    StoreDataRequest,
    StoreDataResponse
} from '../../src/proto/packages/dht/protos/DhtRpc'
import { generateId, MockStoreService } from '../utils'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'
import { DhtCallContext } from '../../src/rpc-protocol/DhtCallContext'
import { StoreServiceClient } from '../../src/proto/packages/dht/protos/DhtRpc.client'
import { RemoteStore } from '../../src/dht/store/RemoteStore'
import { Any } from '../../src/proto/google/protobuf/any'

describe('RemoteStore', () => {

    let remoteStore: RemoteStore
    let clientRpcCommunicator: RpcCommunicator
    let serverRpcCommunicator: RpcCommunicator
    const serviceId = 'test'
    const clientPeerDescriptor: PeerDescriptor = {
        kademliaId: generateId('dhtPeer'),
        type: 0
    }
    const serverPeerDescriptor: PeerDescriptor = {
        kademliaId: generateId('server'),
        type: 0
    }
    const data = Any.pack(clientPeerDescriptor, PeerDescriptor)
    const request: StoreDataRequest = {
        kademliaId: clientPeerDescriptor.kademliaId,
        data,
        ttl: 10
    }

    beforeEach(() => {
        clientRpcCommunicator = new RpcCommunicator()
        serverRpcCommunicator = new RpcCommunicator()
        serverRpcCommunicator.registerRpcMethod(StoreDataRequest, StoreDataResponse, 'storeData', MockStoreService.storeData)
        clientRpcCommunicator.on('outgoingMessage', (message: RpcMessage, _requestId: string, _ucallContext?: DhtCallContext) => {
            serverRpcCommunicator.handleIncomingMessage(message)
        })
        serverRpcCommunicator.on('outgoingMessage', (message: RpcMessage, _requestId: string, _ucallContext?: DhtCallContext) => {
            clientRpcCommunicator.handleIncomingMessage(message)
        })
        const client = toProtoRpcClient(new StoreServiceClient(clientRpcCommunicator.getRpcClientTransport()))
        remoteStore = new RemoteStore(clientPeerDescriptor, serverPeerDescriptor, client, serviceId)
    })

    it('storeData happy path', async () => {
        const response = await remoteStore.storeData(request)
        expect(response.error).toBeEmpty()
    })

    it('storeData rejects', async () => {
        serverRpcCommunicator.registerRpcMethod(StoreDataRequest, StoreDataResponse, 'storeData', MockStoreService.throwStoreDataError)
        await expect(remoteStore.storeData(request))
            .rejects.toThrowError('Could not store data to 736572766572 from 64687450656572 Error: Mock')
    })

    it('storeData response error', async () => {
        serverRpcCommunicator.registerRpcMethod(StoreDataRequest, StoreDataResponse, 'storeData', MockStoreService.storeDataErrorString)
        const response = await remoteStore.storeData(request)
        expect(response.error).toEqual('Mock')
    })

})
