import { RpcCommunicator, toProtoRpcClient } from '@streamr/proto-rpc'
import {
    NodeType,
    PeerDescriptor,
    StoreDataRequest,
    StoreDataResponse
} from '../../src/proto/packages/dht/protos/DhtRpc'
import { generateId, mockStoreRpc } from '../utils/utils'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'
import { StoreRpcClient } from '../../src/proto/packages/dht/protos/DhtRpc.client'
import { StoreRpcRemote } from '../../src/dht/store/StoreRpcRemote'
import { Any } from '../../src/proto/google/protobuf/any'

describe('StoreRpcRemote', () => {

    let rpcRemote: StoreRpcRemote
    let clientRpcCommunicator: RpcCommunicator
    let serverRpcCommunicator: RpcCommunicator
    const serviceId = 'test'
    const clientPeerDescriptor: PeerDescriptor = {
        nodeId: generateId('client'),
        type: NodeType.NODEJS
    }
    const serverPeerDescriptor: PeerDescriptor = {
        nodeId: generateId('server'),
        type: NodeType.NODEJS
    }
    const data = Any.pack(clientPeerDescriptor, PeerDescriptor)
    const request: StoreDataRequest = {
        key: clientPeerDescriptor.nodeId,
        data,
        ttl: 10
    }

    beforeEach(() => {
        clientRpcCommunicator = new RpcCommunicator()
        serverRpcCommunicator = new RpcCommunicator()
        serverRpcCommunicator.registerRpcMethod(StoreDataRequest, StoreDataResponse, 'storeData', mockStoreRpc.storeData)
        clientRpcCommunicator.on('outgoingMessage', (message: RpcMessage) => {
            serverRpcCommunicator.handleIncomingMessage(message)
        })
        serverRpcCommunicator.on('outgoingMessage', (message: RpcMessage) => {
            clientRpcCommunicator.handleIncomingMessage(message)
        })
        const client = toProtoRpcClient(new StoreRpcClient(clientRpcCommunicator.getRpcClientTransport()))
        rpcRemote = new StoreRpcRemote(clientPeerDescriptor, serverPeerDescriptor, serviceId, client)
    })

    it('storeData happy path', async () => {
        const response = await rpcRemote.storeData(request)
        expect(response.error).toBeEmpty()
    })

    it('storeData rejects', async () => {
        serverRpcCommunicator.registerRpcMethod(StoreDataRequest, StoreDataResponse, 'storeData', mockStoreRpc.throwStoreDataError)
        await expect(rpcRemote.storeData(request))
            .rejects.toThrowError('Could not store data to 736572766572 from 636c69656e74 Error: Mock')
    })

    it('storeData response error', async () => {
        serverRpcCommunicator.registerRpcMethod(StoreDataRequest, StoreDataResponse, 'storeData', mockStoreRpc.storeDataErrorString)
        const response = await rpcRemote.storeData(request)
        expect(response.error).toEqual('Mock')
    })

})
