import { ProtoRpcClient, RpcCommunicator, toProtoRpcClient } from '@streamr/proto-rpc'
import { WebsocketConnectorRpcClient } from '../../src/proto/packages/dht/protos/DhtRpc.client'
import { createMockPeerDescriptor } from '../utils/utils'
import {
    WebsocketConnectionRequest,
    WebsocketConnectionResponse
} from '../../src/proto/packages/dht/protos/DhtRpc'
import { mockWebsocketConnectorRpc } from '../utils/utils'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'

describe('WebsocketConnectorRpc', () => {

    let rpcCommunicator1: RpcCommunicator
    let rpcCommunicator2: RpcCommunicator
    let client1: ProtoRpcClient<WebsocketConnectorRpcClient>
    let client2: ProtoRpcClient<WebsocketConnectorRpcClient>
    const peerDescriptor1 = createMockPeerDescriptor()
    const peerDescriptor2 = createMockPeerDescriptor()

    beforeEach(() => {
        rpcCommunicator1 = new RpcCommunicator()
        rpcCommunicator1.registerRpcMethod(
            WebsocketConnectionRequest,
            WebsocketConnectionResponse,
            'requestConnection',
            mockWebsocketConnectorRpc.requestConnection
        )

        rpcCommunicator2 = new RpcCommunicator()
        rpcCommunicator2.registerRpcMethod(
            WebsocketConnectionRequest,
            WebsocketConnectionResponse,
            'requestConnection',
            mockWebsocketConnectorRpc.requestConnection
        )

        rpcCommunicator1.on('outgoingMessage', (message: RpcMessage) => {
            rpcCommunicator2.handleIncomingMessage(message)
        })

        rpcCommunicator2.on('outgoingMessage', (message: RpcMessage) => {
            rpcCommunicator1.handleIncomingMessage(message)
        })

        client1 = toProtoRpcClient(new WebsocketConnectorRpcClient(rpcCommunicator1.getRpcClientTransport()))
        client2 = toProtoRpcClient(new WebsocketConnectorRpcClient(rpcCommunicator2.getRpcClientTransport()))
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
