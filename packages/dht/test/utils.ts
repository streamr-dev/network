import { DhtNode } from '../src/dht/DhtNode'
import { DhtTransportClient } from '../src/transport/DhtTransportClient'
import { DhtTransportServer } from '../src/transport/DhtTransportServer'
import { MockConnectionManager } from '../src/connection/MockConnectionManager'
import { RpcCommunicator } from '../src/transport/RpcCommunicator'
import { DhtRpcClient } from '../src/proto/DhtRpc.client'
import { ClosestPeersRequest, PeerDescriptor, RpcMessage } from '../src/proto/DhtRpc'
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