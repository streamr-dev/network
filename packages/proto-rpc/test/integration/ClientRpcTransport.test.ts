import { ClosestPeersResponse, PeerDescriptor } from '../proto/TestProtos'
import { RpcMessage } from '../../src/proto/ProtoRpc'
import { RpcCommunicator } from '../../src/RpcCommunicator'
import { DhtRpcServiceClient } from '../proto/TestProtos.client'
import { getMockPeers } from '../utils'
import { ProtoCallContext } from '../../src/ProtoCallContext'
import { toProtoRpcClient } from '../../src/toProtoRpcClient'
import { Any } from '../../src/proto/google/protobuf/any'

describe('DhtClientRpcTransport', () => {
    it('Happy Path getClosestNeighbors', async () => {
        const rpcCommunicator = new RpcCommunicator()
        rpcCommunicator.on('outgoingMessage', (message: RpcMessage, _requestId: string, _ucallContext?: ProtoCallContext) => {
            //const request = RpcMessage.fromBinary(message)
            const responseBody: ClosestPeersResponse = {
                peers: getMockPeers(),
                requestId: 'TO BE REMOVED'
            }
            
            const response: RpcMessage = {
                header: {
                    response: 'hiihii'
                },
                body: Any.pack(responseBody, ClosestPeersResponse),
                requestId: message.requestId
            }
            
            rpcCommunicator.handleIncomingMessage(response)
        })

        const client =  toProtoRpcClient(new DhtRpcServiceClient(rpcCommunicator.getRpcClientTransport()))

        const peerDescriptor: PeerDescriptor = {
            peerId: new Uint8Array([56, 59, 77]),
            type: 0
        }
        const res = await client.getClosestPeers({ peerDescriptor, requestId: '1' })
        expect(res.peers.length).toEqual(4)
        expect(res.peers[0]).toEqual(getMockPeers()[0])
        expect(res.peers[1]).toEqual(getMockPeers()[1])
        expect(res.peers[2]).toEqual(getMockPeers()[2])
        expect(res.peers[3]).toEqual(getMockPeers()[3])
    })
})
