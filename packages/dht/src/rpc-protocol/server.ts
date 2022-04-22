import { ClosestPeersRequest, ClosestPeersResponse, PeerDescriptor, NodeType } from '../proto/DhtRpc'
import { IDhtRpc } from '../proto/DhtRpc.server'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DummyServerCallContext } from '../transport/DhtTransportServer'
import { nodeFormatPeerDescriptor, generateId, stringFromId } from '../dht/helpers'
import { DhtPeer } from '../dht/DhtPeer'
import { TODO } from '../types'

export const createRpcMethods = (fn: TODO): any => {
    const DhtRpc: IDhtRpc = {
        async getClosestPeers(request: ClosestPeersRequest, _context: ServerCallContext): Promise<ClosestPeersResponse> {
            const peerDescriptor = nodeFormatPeerDescriptor(request.peerDescriptor!)
            const closestPeers = fn(peerDescriptor)
            const peerDescriptors = closestPeers.map((dhtPeer: DhtPeer) => dhtPeer.getPeerDscriptor())
            const response = {
                peers: peerDescriptors,
                nonce: 'aaaaaa'
            }
            return response
        }
    }

    const RegisterDhtRpc = {
        async getClosestPeers(bytes: Uint8Array): Promise<Uint8Array> {
            const request = ClosestPeersRequest.fromBinary(bytes)
            const response = await DhtRpc.getClosestPeers(request, new DummyServerCallContext())
            return ClosestPeersResponse.toBinary(response)
        }
    }

    return RegisterDhtRpc
}

const MockDhtRpc: IDhtRpc = {
    async getClosestPeers(request: ClosestPeersRequest, _context: ServerCallContext): Promise<ClosestPeersResponse> {
        console.info('RPC server processing getClosestPeers request for', request.peerDescriptor!.peerId)
        const neighbors = getMockPeers()
        const response: ClosestPeersResponse = {
            peers: neighbors,
            nonce: 'why am i still here'
        }
        return response
    }
}

export const MockRegisterDhtRpc = {
    async getClosestPeers(bytes: Uint8Array): Promise<Uint8Array> {
        const request = ClosestPeersRequest.fromBinary(bytes)
        const response = await MockDhtRpc.getClosestPeers(request, new DummyServerCallContext())
        return ClosestPeersResponse.toBinary(response)
    }
}

export const getMockPeers = (): PeerDescriptor[] => {
    const n1: PeerDescriptor = {
        peerId: generateId('Neighbor1'),
        type: NodeType.NODEJS,
    }
    const n2: PeerDescriptor = {
        peerId: generateId('Neighbor2'),
        type: NodeType.NODEJS,
    }
    const n3: PeerDescriptor = {
        peerId: generateId('Neighbor3'),
        type: NodeType.NODEJS,
    }
    const n4: PeerDescriptor = {
        peerId: generateId('Neighbor1'),
        type: NodeType.BROWSER,
    }
    return [
        n1, n2, n3, n4
    ]
}