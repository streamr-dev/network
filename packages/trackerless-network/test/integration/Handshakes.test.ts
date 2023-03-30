import { Handshaker } from '../../src/logic/neighbor-discovery/Handshaker'
import {
    NodeType,
    PeerDescriptor,
    ListeningRpcCommunicator,
    Simulator,
    SimulatorTransport,
    peerIdFromPeerDescriptor
} from '@streamr/dht'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import {
    HandshakeRpcClient
} from '../../src/proto/packages/trackerless-network/protos/NetworkRpc.client'
import { PeerList } from '../../src/logic/PeerList'
import { mockConnectionLocker } from '../utils/utils'
import { StreamHandshakeRequest, StreamHandshakeResponse } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { RemoteHandshaker } from '../../src/logic/neighbor-discovery/RemoteHandshaker'

describe('Handshakes', () => {

    const peerDescriptor1: PeerDescriptor = {
        kademliaId: new Uint8Array([1, 1, 1]),
        type: NodeType.NODEJS
    }
    const peerDescriptor2: PeerDescriptor = {
        kademliaId: new Uint8Array([2, 1, 1]),
        type: NodeType.NODEJS
    }
    const peerDescriptor3: PeerDescriptor = {
        kademliaId: new Uint8Array([3, 1, 1]),
        type: NodeType.NODEJS
    }
    let rpcCommunicator1: ListeningRpcCommunicator
    let rpcCommunicator2: ListeningRpcCommunicator
    let rpcCommunicator3: ListeningRpcCommunicator
    let contactPool: PeerList
    let targetNeighbors: PeerList
    let handshaker: Handshaker
    const randomGraphId = 'handshaker'

    const acceptHandshake = async (request: StreamHandshakeRequest, _context: ServerCallContext): Promise<StreamHandshakeResponse> => {
        const response: StreamHandshakeResponse = {
            requestId: request.requestId,
            accepted: true
        }
        return response
    }

    const rejectHandshake = async (request: StreamHandshakeRequest, _context: ServerCallContext): Promise<StreamHandshakeResponse> => {
        const response: StreamHandshakeResponse = {
            requestId: request.requestId,
            accepted: false
        }
        return response
    }

    const interleavingHandshake = async (request: StreamHandshakeRequest, _context: ServerCallContext): Promise<StreamHandshakeResponse> => {
        const response: StreamHandshakeResponse = {
            requestId: request.requestId,
            accepted: true,
            interleaveTarget: peerDescriptor3
        }
        return response
    }

    beforeEach(() => {
        const simulator = new Simulator()
        const simulatorTransport1 = new SimulatorTransport(peerDescriptor1, simulator)
        const simulatorTransport2 = new SimulatorTransport(peerDescriptor2, simulator)
        const simulatorTransport3 = new SimulatorTransport(peerDescriptor3, simulator)

        rpcCommunicator1 = new ListeningRpcCommunicator(randomGraphId, simulatorTransport1)
        rpcCommunicator2 = new ListeningRpcCommunicator(randomGraphId, simulatorTransport2)
        rpcCommunicator3 = new ListeningRpcCommunicator(randomGraphId, simulatorTransport3)

        const handshakerPeerId = peerIdFromPeerDescriptor(peerDescriptor2)
        contactPool = new PeerList(handshakerPeerId, 10)
        targetNeighbors = new PeerList(handshakerPeerId, 4)
        handshaker = new Handshaker({
            ownPeerDescriptor: peerDescriptor2,
            randomGraphId: randomGraphId,
            nearbyContactPool: contactPool,
            randomContactPool: contactPool,
            targetNeighbors: targetNeighbors,
            connectionLocker: mockConnectionLocker,
            rpcCommunicator: rpcCommunicator2,
            N: 4
        })

    })

    afterEach(() => {
        rpcCommunicator1.stop()
        rpcCommunicator2.stop()
        rpcCommunicator3.stop()
    })

    it('Two peers can handshake', async () => {
        rpcCommunicator1.registerRpcMethod(StreamHandshakeRequest, StreamHandshakeResponse, 'handshake', acceptHandshake)
        // @ts-expect-error private
        const res = await handshaker.handshakeWithTarget(
            new RemoteHandshaker(
                peerDescriptor1,
                randomGraphId,
                toProtoRpcClient(new HandshakeRpcClient(rpcCommunicator2.getRpcClientTransport())),
            )
        )
        expect(res).toEqual(true)
        expect(targetNeighbors.hasPeer(peerDescriptor1)).toEqual(true)
    })

    it('Handshake accepted', async () => {
        rpcCommunicator1.registerRpcMethod(StreamHandshakeRequest, StreamHandshakeResponse, 'handshake', acceptHandshake)
        // @ts-expect-error private
        const res = await handshaker.handshakeWithTarget(
            new RemoteHandshaker(
                peerDescriptor1,
                randomGraphId,
                toProtoRpcClient(new HandshakeRpcClient(rpcCommunicator2.getRpcClientTransport())),
            )
        )
        expect(res).toEqual(true)
        expect(targetNeighbors.hasPeer(peerDescriptor1)).toEqual(true)
    })

    it('Handshake rejected', async () => {
        rpcCommunicator1.registerRpcMethod(StreamHandshakeRequest, StreamHandshakeResponse, 'handshake', rejectHandshake)
        // @ts-expect-error private
        const res = await handshaker.handshakeWithTarget(
            new RemoteHandshaker(
                peerDescriptor1,
                randomGraphId,
                toProtoRpcClient(new HandshakeRpcClient(rpcCommunicator2.getRpcClientTransport())),
            )
        )
        expect(res).toEqual(false)
        expect(targetNeighbors.hasPeer(peerDescriptor1)).toEqual(false)
    })

    it('Handshake with Interleaving', async () => {
        rpcCommunicator1.registerRpcMethod(StreamHandshakeRequest, StreamHandshakeResponse, 'handshake', interleavingHandshake)
        rpcCommunicator3.registerRpcMethod(StreamHandshakeRequest, StreamHandshakeResponse, 'handshake', acceptHandshake)
        // @ts-expect-error private
        const res = await handshaker.handshakeWithTarget(
            new RemoteHandshaker(
                peerDescriptor1,
                randomGraphId,
                toProtoRpcClient(new HandshakeRpcClient(rpcCommunicator2.getRpcClientTransport())),
            )
        )
        expect(res).toEqual(true)
        expect(targetNeighbors.hasPeer(peerDescriptor1)).toEqual(true)
        expect(targetNeighbors.hasPeer(peerDescriptor3)).toEqual(true)
    })
})
