import { DhtNode } from '../src/dht/DhtNode'
import { MockConnectionManager } from '../src/connection/MockConnectionManager'
import {
    ClosestPeersRequest,
    ConnectivityResponseMessage,
    NodeType,
    PeerDescriptor,
    RpcMessage
} from '../src/proto/DhtRpc'
import { PeerID } from '../src/PeerID'
import { Simulator } from '../src/connection/Simulator'

export const createMockConnectionDhtNode = async (stringId: string): Promise<DhtNode> => {
    const id = PeerID.fromString(stringId)
    const peerDescriptor: PeerDescriptor = {
        peerId: id.value,
        type: NodeType.NODEJS
    }
   
    const mockConnectionLayer = new MockConnectionManager(peerDescriptor)
    
    const node = new DhtNode({peerDescriptor: peerDescriptor, transportLayer: mockConnectionLayer})
    await node.start()
    Simulator.instance().addNode(node)
    return node
}

export const createMockConnectionLayer1Node = async (stringId: string, layer0Node: DhtNode): Promise<DhtNode> => {
    const id = PeerID.fromString(stringId)
    const descriptor: PeerDescriptor = {
        peerId: id.value,
        type: 0
    }
    
    const node = new DhtNode({peerDescriptor: descriptor, transportLayer: layer0Node})
    await node.start()
    return node
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
