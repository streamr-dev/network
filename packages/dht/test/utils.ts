import { DhtNode } from '../src/dht/DhtNode'
import { DhtTransportClient } from '../src/transport/DhtTransportClient'
import { DhtTransportServer } from '../src/transport/DhtTransportServer'
import { MockConnectionManager } from '../src/connection/MockConnectionManager'
import { RpcCommunicator } from '../src/transport/RpcCommunicator'
import { DhtRpcClient } from '../src/proto/DhtRpc.client'
import { Event as MessageRouterEvent } from '../src/rpc-protocol/IMessageRouter'
import {
    ClosestPeersRequest,
    ConnectivityResponseMessage,
    Message,
    MessageType,
    NodeType,
    PeerDescriptor,
    RpcMessage
} from '../src/proto/DhtRpc'
import { PeerID } from '../src/PeerID'
import { ConnectionManager } from '../src/connection/ConnectionManager'

export const createMockConnectionDhtNode = (stringId: string): DhtNode => {
    const id = PeerID.fromString(stringId)
    const peerDescriptor: PeerDescriptor = {
        peerId: id.value,
        type: NodeType.NODEJS
    }
    const clientTransport = new DhtTransportClient(2000)
    const serverTransport = new DhtTransportServer()
    const mockConnectionLayer = new MockConnectionManager()
    const rpcCommunicator = new RpcCommunicator(mockConnectionLayer, clientTransport, serverTransport)
    const client = new DhtRpcClient(clientTransport)
    return new DhtNode(peerDescriptor, client, clientTransport, serverTransport, rpcCommunicator)
}

export const createMockConnectionLayer1Node = (stringId: string, layer0Node: DhtNode): DhtNode => {
    const id = PeerID.fromString(stringId)
    const descriptor: PeerDescriptor = {
        peerId: id.value,
        type: 0
    }
    const clientTransport = new DhtTransportClient(10000)
    const serverTransport = new DhtTransportServer()
    const mockConnectionLayer = new MockConnectionManager()
    const rpcCommunicator = new RpcCommunicator(mockConnectionLayer, clientTransport, serverTransport, 10000)
    rpcCommunicator.setSendFn(async (peerDescriptor, message) => {
        await layer0Node.routeMessage({
            message: message.body,
            messageType: MessageType.RPC,
            destinationPeer: peerDescriptor,
            sourcePeer: descriptor
        })
    })
    const client = new DhtRpcClient(clientTransport)
    layer0Node.on(MessageRouterEvent.DATA, async (peerDescriptor: PeerDescriptor, messageType: MessageType, message: Message) => {
        await rpcCommunicator.onIncomingMessage(peerDescriptor, message)
    })
    return new DhtNode(descriptor, client, clientTransport, serverTransport, rpcCommunicator)
}

export const createWrappedClosestPeersRequest = (
    sourceDescriptor: PeerDescriptor,
    destinationDescriptor: PeerDescriptor
): RpcMessage => {

    const routedMessage: ClosestPeersRequest = {
        peerDescriptor: sourceDescriptor,
        nonce: '11111'
    }
    const rpcWrapper: RpcMessage = {
        body: ClosestPeersRequest.toBinary(routedMessage),
        header: {
            method: 'closestPeersRequest',
            request: 'request'
        },
        requestId: 'testId',
        sourceDescriptor: sourceDescriptor,
        targetDescriptor: destinationDescriptor
    }
    return rpcWrapper
}

export const createPeerDescriptor = (msg: ConnectivityResponseMessage, peerIdString?: string): PeerDescriptor => {
    const ret: PeerDescriptor = {
        peerId: peerIdString ? PeerID.fromString(peerIdString).value : PeerID.fromIp(msg.ip).value,
        type: NodeType.NODEJS,
        websocket: {ip: msg.websocket!.ip, port: msg.websocket!.port}
    }
    return ret
}

export const createLayer0Peer = (peerDescriptor: PeerDescriptor, connectionManager: ConnectionManager): DhtNode => {
    const clientTransport = new DhtTransportClient()
    const serverTransport = new DhtTransportServer()
    const rpcCommunicator = new RpcCommunicator(connectionManager, clientTransport, serverTransport)
    const client = new DhtRpcClient(clientTransport)
    rpcCommunicator.setSendFn((peerDescriptor, message) => {
        connectionManager.send(peerDescriptor, message)
    })
    return new DhtNode(peerDescriptor, client, clientTransport, serverTransport, rpcCommunicator)
}