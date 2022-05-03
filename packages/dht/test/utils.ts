import { DhtNode } from '../src/dht/DhtNode'
import { DhtTransportClient } from '../src/transport/DhtTransportClient'
import { DhtTransportServer } from '../src/transport/DhtTransportServer'
import { MockConnectionManager } from '../src/connection/MockConnectionManager'
import { RpcCommunicator } from '../src/transport/RpcCommunicator'
import { DhtRpcClient } from '../src/proto/DhtRpc.client'
import { Event as MessageRouterEvent } from '../src/rpc-protocol/IMessageRouter'
import {
    ClosestPeersRequest,
    PeerDescriptor,
    RouteMessageType,
    RpcMessage
} from '../src/proto/DhtRpc'
import { PeerID } from '../src/PeerID'

export const createMockConnectionDhtNode = (stringId: string): DhtNode => {
    const id = PeerID.fromString(stringId)
    const clientTransport = new DhtTransportClient()
    const serverTransport = new DhtTransportServer()
    const mockConnectionLayer = new MockConnectionManager()
    const rpcCommunicator = new RpcCommunicator(mockConnectionLayer, clientTransport, serverTransport)
    const client = new DhtRpcClient(clientTransport)
    return new DhtNode(id, client, clientTransport, serverTransport, rpcCommunicator)
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
    rpcCommunicator.setSendFn(async (peerDescriptor, bytes) => {
        await layer0Node.routeMessage({
            message: bytes,
            messageType: RouteMessageType.RPC_WRAPPER,
            destinationPeer: peerDescriptor,
            sourcePeer: descriptor
        })
    })
    const client = new DhtRpcClient(clientTransport)
    layer0Node.on(MessageRouterEvent.DATA, async (peerDescriptor: PeerDescriptor, messageType: RouteMessageType, bytes: Uint8Array) => {
        await rpcCommunicator.onIncomingMessage(peerDescriptor, bytes)
    })
    return new DhtNode(id, client, clientTransport, serverTransport, rpcCommunicator)
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