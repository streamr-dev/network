import { DhtTransportClient } from './transport/DhtTransportClient'
import { DhtRpcClient } from './proto/DhtRpc.client'
import { RpcCommunicator } from './transport/RpcCommunicator'
import { MockConnectionLayer } from './connection/MockConnectionLayer'
import { DhtTransportServer } from './transport/DhtTransportServer'
import { PeerID } from './types'
import { MockRegisterDhtRpc } from './rpc-protocol/server'

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

    rpcCommunicator1.setSendFn((peerId: PeerID, bytes: Uint8Array) => {
        rpcCommunicator2.onIncomingMessage(bytes)
    })
    rpcCommunicator2.setSendFn((peerId: PeerID, bytes: Uint8Array) => {
        rpcCommunicator1.onIncomingMessage(bytes)
    })

    const client1 = new DhtRpcClient(clientTransport1)
    const client2 = new DhtRpcClient(clientTransport2)

    const response1 = client1.getClosestPeers({peerId: 'peer', nonce: '1'})
    const res1 = await response1.response
    console.log(res1)

    const response2 = client2.getClosestPeers({peerId: 'peer', nonce: '1'})
    const res2 = await response2.response
    console.log(res2)
}

main()