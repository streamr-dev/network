import { RpcCommunicator, toProtoRpcClient } from '@streamr/proto-rpc'
import {
    PeerDescriptor,
    StoreDataRequest,
    StoreDataResponse
} from '../../src/proto/packages/dht/protos/DhtRpc'
import { createMockPeerDescriptor, mockStoreRpc } from '../utils/utils'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'
import { StoreRpcClient } from '../../src/proto/packages/dht/protos/DhtRpc.client'
import { StoreRpcRemote } from '../../src/dht/store/StoreRpcRemote'
import { Any } from '../../src/proto/google/protobuf/any'
import { getNodeIdFromPeerDescriptor } from '../../src/helpers/peerIdFromPeerDescriptor'

const SERVICE_ID = 'test'

describe('StoreRpcRemote', () => {

    let rpcRemote: StoreRpcRemote
    let clientRpcCommunicator: RpcCommunicator
    let serverRpcCommunicator: RpcCommunicator
    const clientPeerDescriptor = createMockPeerDescriptor()
    const serverPeerDescriptor = createMockPeerDescriptor()
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
        rpcRemote = new StoreRpcRemote(clientPeerDescriptor, serverPeerDescriptor, SERVICE_ID, client)
    })

    it('storeData happy path', async () => {
        const response = await rpcRemote.storeData(request)
        expect(response.error).toBeEmpty()
    })

    it('storeData rejects', async () => {
        serverRpcCommunicator.registerRpcMethod(StoreDataRequest, StoreDataResponse, 'storeData', mockStoreRpc.throwStoreDataError)
        await expect(rpcRemote.storeData(request)).rejects.toThrowError(
            'Could not store data to'
            + ` ${getNodeIdFromPeerDescriptor(serverPeerDescriptor)} from ${getNodeIdFromPeerDescriptor(clientPeerDescriptor)}`
            + ' Error: Mock'
        )
    })

    it('storeData response error', async () => {
        serverRpcCommunicator.registerRpcMethod(StoreDataRequest, StoreDataResponse, 'storeData', mockStoreRpc.storeDataErrorString)
        const response = await rpcRemote.storeData(request)
        expect(response.error).toEqual('Mock')
    })

})
