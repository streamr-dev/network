import { ClosestPeersResponse, PeerDescriptor, RpcMessage } from '../../src/proto/DhtRpc'
import { RpcCommunicator } from '../../src/transport/RpcCommunicator'
import { DhtRpcClient } from '../../src/proto/DhtRpc.client'
import { getMockPeers } from '../utils'
import { PeerID } from '../../src/helpers/PeerID'
import { CallContext } from '../../src/rpc-protocol/ServerTransport'
import { Event as RpcIoEvent } from '../../src/transport/IRpcIo'

describe('DhtClientRpcTransport', () => {

    beforeAll(() => {

    })

    it('Happy Path getClosestNeighbors', async () => {
        const rpcCommunicator = new RpcCommunicator()
        rpcCommunicator.on(RpcIoEvent.OUTGOING_MESSAGE, (message: Uint8Array, _ucallContext?: CallContext) => {
            const request = RpcMessage.fromBinary(message)
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
            
            rpcCommunicator.handleIncomingMessage(RpcMessage.toBinary(response))
        })

        const client = new DhtRpcClient(rpcCommunicator.getRpcClientTransport())

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
