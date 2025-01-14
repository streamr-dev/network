import { RpcCommunicator } from '@streamr/proto-rpc'
import { StoreDataRequest, StoreDataResponse } from '../../generated/packages/dht/protos/DhtRpc'
import { createMockPeerDescriptor, mockStoreRpc } from '../utils/utils'
import { RpcMessage } from '../../generated/packages/proto-rpc/protos/ProtoRpc'
import { StoreRpcClient } from '../../generated/packages/dht/protos/DhtRpc.client'
import { StoreRpcRemote } from '../../src/dht/store/StoreRpcRemote'
import { createMockDataEntry } from '../utils/mock/mockDataEntry'
import { DhtCallContext } from '../../src/rpc-protocol/DhtCallContext'
import { randomDhtAddress, toNodeId, toDhtAddressRaw } from '../../src/identifiers'

describe('StoreRpcRemote', () => {
    let rpcRemote: StoreRpcRemote
    let clientRpcCommunicator: RpcCommunicator<DhtCallContext>
    let serverRpcCommunicator: RpcCommunicator<DhtCallContext>
    const clientPeerDescriptor = createMockPeerDescriptor()
    const serverPeerDescriptor = createMockPeerDescriptor()
    const data = createMockDataEntry()
    const request: StoreDataRequest = {
        key: data.key,
        data: data.data,
        creator: toDhtAddressRaw(randomDhtAddress()),
        ttl: 10
    }

    beforeEach(() => {
        clientRpcCommunicator = new RpcCommunicator()
        serverRpcCommunicator = new RpcCommunicator()
        serverRpcCommunicator.registerRpcMethod(
            StoreDataRequest,
            StoreDataResponse,
            'storeData',
            mockStoreRpc.storeData
        )
        clientRpcCommunicator.setOutgoingMessageListener(async (message: RpcMessage) => {
            serverRpcCommunicator.handleIncomingMessage(message, new DhtCallContext())
        })
        serverRpcCommunicator.setOutgoingMessageListener(async (message: RpcMessage) => {
            clientRpcCommunicator.handleIncomingMessage(message, new DhtCallContext())
        })
        rpcRemote = new StoreRpcRemote(
            clientPeerDescriptor,
            serverPeerDescriptor,
            clientRpcCommunicator,
            StoreRpcClient
        )
    })

    it('storeData happy path', async () => {
        await expect(rpcRemote.storeData(request)).toResolve()
    })

    it('storeData rejects', async () => {
        serverRpcCommunicator.registerRpcMethod(
            StoreDataRequest,
            StoreDataResponse,
            'storeData',
            mockStoreRpc.throwStoreDataError
        )
        await expect(rpcRemote.storeData(request)).rejects.toThrow(
            'Could not store data to' +
                ` ${toNodeId(serverPeerDescriptor)} from ${toNodeId(clientPeerDescriptor)}` +
                ' Error: Mock'
        )
    })
})
