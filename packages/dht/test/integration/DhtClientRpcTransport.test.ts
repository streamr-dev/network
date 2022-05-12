import { ClosestPeersResponse, Message, MessageType, PeerDescriptor, RpcMessage } from '../../src/proto/DhtRpc'
import { ClientTransport } from '../../src/transport/ClientTransport'
import { ServerTransport } from '../../src/transport/ServerTransport'
import { MockConnectionManager } from '../../src/connection/MockConnectionManager'
import { RpcCommunicator } from '../../src/transport/RpcCommunicator'
import { DhtRpcClient } from '../../src/proto/DhtRpc.client'
import { getMockPeers } from '../../src/rpc-protocol/server'
import { v4 } from 'uuid'
import { PeerID } from '../../src/PeerID'

describe('DhtClientRpcTransport', () => {

    beforeAll(() => {

    })

    it('Happy Path getClosestNeighbors', async () => {
        const clientTransport = new ClientTransport()
        const serverTransport = new ServerTransport()
        const mockDescriptor = {
            peerId: PeerID.fromString('jee').value,
            type: 0
        }
        const mockConnectionManager = new MockConnectionManager(mockDescriptor)
        const rpcCommunicator = new RpcCommunicator({
            connectionLayer: mockConnectionManager,
            dhtTransportClient: clientTransport,
            dhtTransportServer: serverTransport
        })
        rpcCommunicator.setSendFn((peerDescriptor: PeerDescriptor, message: Message) => {
            const request = RpcMessage.fromBinary(message.body)
            const responseBody: ClosestPeersResponse = {
                peers: getMockPeers(),
                nonce: 'TO BE REMOVED'
            }
            
            const response: RpcMessage = {
                header: {
                    response: 'hiihii'
                },
                body: ClosestPeersResponse.toBinary(responseBody),
                requestId: request.requestId
            }
            const msg: Message = {messageId: v4(), messageType: MessageType.RPC, body: RpcMessage.toBinary(response)}
            rpcCommunicator.onIncomingMessage(peerDescriptor, msg)
        })

        const client = new DhtRpcClient(clientTransport)

        const peerDescriptor: PeerDescriptor = {
            peerId: PeerID.fromString('peer').value,
            type: 0
        }
        const response = client.getClosestPeers({peerDescriptor, nonce: '1'})
        const res = await response.response
        expect(res.peers.length).toEqual(4)
        expect(res.peers[0]).toEqual(getMockPeers()[0])
        expect(res.peers[1]).toEqual(getMockPeers()[1])
        expect(res.peers[2]).toEqual(getMockPeers()[2])
        expect(res.peers[3]).toEqual(getMockPeers()[3])
    })
})
