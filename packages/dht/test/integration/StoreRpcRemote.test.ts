import { RpcCommunicator, toProtoRpcClient } from '@streamr/proto-rpc'
import {
    StoreDataRequest,
    StoreDataResponse
} from '../../src/proto/packages/dht/protos/DhtRpc'
import { createMockPeerDescriptor, mockStoreRpc } from '../utils/utils'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'
import { StoreRpcClient } from '../../src/proto/packages/dht/protos/DhtRpc.client'
import { StoreRpcRemote } from '../../src/dht/store/StoreRpcRemote'
import { createMockDataEntry } from '../utils/mock/mockDataEntry'
import { getNodeIdFromPeerDescriptor } from '../../src/helpers/peerIdFromPeerDescriptor'
import { createRandomNodeId } from '../../src/helpers/nodeId'

const SERVICE_ID = 'test'

describe('StoreRpcRemote', () => {

    let rpcRemote: StoreRpcRemote
    let clientRpcCommunicator: RpcCommunicator
    let serverRpcCommunicator: RpcCommunicator
    const clientPeerDescriptor = createMockPeerDescriptor()
    const serverPeerDescriptor = createMockPeerDescriptor()
    const data = createMockDataEntry()
    const request: StoreDataRequest = {
        key: data.key,
        data: data.data,
        creator: createRandomNodeId(),
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
        await expect(rpcRemote.storeData(request)).toResolve()
    })

    it('storeData rejects', async () => {
        serverRpcCommunicator.registerRpcMethod(StoreDataRequest, StoreDataResponse, 'storeData', mockStoreRpc.throwStoreDataError)
        await expect(rpcRemote.storeData(request)).rejects.toThrowError(
            'Could not store data to'
            + ` ${getNodeIdFromPeerDescriptor(serverPeerDescriptor)} from ${getNodeIdFromPeerDescriptor(clientPeerDescriptor)}`
            + ' Error: Mock'
        )
    })
})
