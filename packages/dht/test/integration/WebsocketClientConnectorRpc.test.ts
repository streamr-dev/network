import { ProtoRpcClient, RpcCommunicator, toProtoRpcClient } from '@streamr/proto-rpc'
import { WebsocketClientConnectorRpcClient } from '../../src/proto/packages/dht/protos/DhtRpc.client'
import { createMockPeerDescriptor, mockWebsocketClientConnectorRpc } from '../utils/utils'
import { WebsocketConnectionRequest } from '../../src/proto/packages/dht/protos/DhtRpc'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'
import { Empty } from '../../src/proto/google/protobuf/empty'
import { DhtCallContext } from '../../src/rpc-protocol/DhtCallContext'

describe('WebsocketClientConnectorRpc', () => {

    let rpcCommunicator1: RpcCommunicator<DhtCallContext>
    let rpcCommunicator2: RpcCommunicator<DhtCallContext>
    let client1: ProtoRpcClient<WebsocketClientConnectorRpcClient>
    let client2: ProtoRpcClient<WebsocketClientConnectorRpcClient>
    const peerDescriptor1 = createMockPeerDescriptor()
    const peerDescriptor2 = createMockPeerDescriptor()

    beforeEach(() => {
        rpcCommunicator1 = new RpcCommunicator()
        rpcCommunicator1.registerRpcMethod(
            WebsocketConnectionRequest,
            Empty,
            'requestConnection',
            mockWebsocketClientConnectorRpc.requestConnection
        )

        rpcCommunicator2 = new RpcCommunicator()
        rpcCommunicator2.registerRpcMethod(
            WebsocketConnectionRequest,
            Empty,
            'requestConnection',
            mockWebsocketClientConnectorRpc.requestConnection
        )

        rpcCommunicator1.setOutgoingMessageListener(async (message: RpcMessage) => {
            rpcCommunicator2.handleIncomingMessage(message)
        })

        rpcCommunicator2.setOutgoingMessageListener(async (message: RpcMessage) => {
            rpcCommunicator1.handleIncomingMessage(message)
        })

        client1 = toProtoRpcClient(new WebsocketClientConnectorRpcClient(rpcCommunicator1.getRpcClientTransport()))
        client2 = toProtoRpcClient(new WebsocketClientConnectorRpcClient(rpcCommunicator2.getRpcClientTransport()))
    })

    afterEach(async () => {
        rpcCommunicator1.stop()
        rpcCommunicator2.stop()
    })

    it('Happy path', async () => {
        const response1 = client1.requestConnection({
            ip: '127.0.0.1',
            port: 9099
        },
        { targetDescriptor: peerDescriptor2 },
        )
        await response1
        
        const response2 = client2.requestConnection({
            ip: '127.0.0.1',
            port: 9111
        },
        { targetDescriptor: peerDescriptor1 },
        )
        await response2
    })
})
