import { DhtTransportClient } from './transport/DhtTransportClient'
import { DhtRpcClient } from './proto/DhtRpc.client'
import { RpcCommunicator } from './transport/RpcCommunicator'
import { MockConnectionLayer } from './connection/MockConnectionLayer'
import { DhtTransportServer } from './transport/DhtTransportServer'
import { PeerID } from './types'
import { MockRegisterDhtRpc } from './rpc-protocol/server'
import { Buffer } from "buffer"
import { PeerDescriptor } from './proto/DhtRpc'
import { generateId } from './dht/helpers'

const main = async () => {
    const clientTransport1 = new DhtTransportClient()
    const serverTransport1 = new DhtTransportServer()
    serverTransport1.registerMethod('getClosestPeers', MockRegisterDhtRpc.getClosestPeers)
    const mockConnectionLayer1 = new MockConnectionLayer()
    const rpcCommunicator1 = new RpcCommunicator(mockConnectionLayer1, clientTransport1, serverTransport1)

    const clientTransport2 = new DhtTransportClient()
    const serverTransport2 = new DhtTransportServer()
    serverTransport2.registerMethod('getClosestPeers', MockRegisterDhtRpc.getClosestPeers)
    const mockConnectionLayer2 = new MockConnectionLayer()
    const rpcCommunicator2 = new RpcCommunicator(mockConnectionLayer2, clientTransport2, serverTransport2)

    rpcCommunicator1.setSendFn((peerDescriptor: PeerDescriptor, bytes: Uint8Array) => {
        rpcCommunicator2.onIncomingMessage(peerDescriptor, bytes)
    })
    rpcCommunicator2.setSendFn((peerDescriptor: PeerDescriptor, bytes: Uint8Array) => {
        rpcCommunicator1.onIncomingMessage(peerDescriptor, bytes)
    })

    const client1 = new DhtRpcClient(clientTransport1)
    const client2 = new DhtRpcClient(clientTransport2)

    const peerDescriptor1: PeerDescriptor = {
        peerId: generateId('peer1'),
        type: 0
    }

    const peerDescriptor2: PeerDescriptor = {
        peerId: generateId('peer2'),
        type: 0
    }
    const response1 = client1.getClosestPeers({peerDescriptor: peerDescriptor1, nonce: '1'})
    const res1 = await response1.response
    console.log(res1)

    const response2 = client2.getClosestPeers({peerDescriptor: peerDescriptor2, nonce: '1'})
    const res2 = await response2.response
    console.log(res2)
}

main()