import { Handshaker } from '../../src/logic/neighbor-discovery/Handshaker'
import {
    PeerDescriptor,
    ListeningRpcCommunicator,
    Simulator,
    SimulatorTransport
} from '@streamr/dht'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import {
    HandshakeRpcClient
} from '../../src/proto/packages/trackerless-network/protos/NetworkRpc.client'
import { NodeList } from '../../src/logic/NodeList'
import { mockConnectionLocker } from '../utils/utils'
import { StreamHandshakeRequest, StreamHandshakeResponse } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { RemoteHandshaker } from '../../src/logic/neighbor-discovery/RemoteHandshaker'
import { getNodeIdFromPeerDescriptor } from '../../src/identifiers'

describe('Handshakes', () => {

    const peerDescriptor1: PeerDescriptor = {
        kademliaId: new Uint8Array([1, 1, 1]),
    }
    const peerDescriptor2: PeerDescriptor = {
        kademliaId: new Uint8Array([2, 1, 1]),
    }
    const peerDescriptor3: PeerDescriptor = {
        kademliaId: new Uint8Array([3, 1, 1]),
    }
    let rpcCommunicator1: ListeningRpcCommunicator
    let rpcCommunicator2: ListeningRpcCommunicator
    let rpcCommunicator3: ListeningRpcCommunicator
    let nodeView: NodeList
    let targetNeighbors: NodeList
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
            interleaveTargetDescriptor: peerDescriptor3
        }
        return response
    }

    let simulator: Simulator
    let simulatorTransport1: SimulatorTransport
    let simulatorTransport2: SimulatorTransport
    let simulatorTransport3: SimulatorTransport

    beforeEach(() => {
        Simulator.useFakeTimers()
        simulator = new Simulator()
        simulatorTransport1 = new SimulatorTransport(peerDescriptor1, simulator)
        simulatorTransport2 = new SimulatorTransport(peerDescriptor2, simulator)
        simulatorTransport3 = new SimulatorTransport(peerDescriptor3, simulator)

        rpcCommunicator1 = new ListeningRpcCommunicator(randomGraphId, simulatorTransport1)
        rpcCommunicator2 = new ListeningRpcCommunicator(randomGraphId, simulatorTransport2)
        rpcCommunicator3 = new ListeningRpcCommunicator(randomGraphId, simulatorTransport3)

        const handshakerNodeId = getNodeIdFromPeerDescriptor(peerDescriptor2)
        nodeView = new NodeList(handshakerNodeId, 10)
        targetNeighbors = new NodeList(handshakerNodeId, 4)
        handshaker = new Handshaker({
            ownPeerDescriptor: peerDescriptor2,
            randomGraphId,
            nearbyNodeView: nodeView,
            randomNodeView: nodeView,
            targetNeighbors,
            connectionLocker: mockConnectionLocker,
            rpcCommunicator: rpcCommunicator2,
            N: 4
        })

    })

    afterEach(async () => {
        rpcCommunicator1.stop()
        rpcCommunicator2.stop()
        rpcCommunicator3.stop()
        await simulatorTransport1.stop()
        await simulatorTransport2.stop()
        await simulatorTransport3.stop()
        simulator.stop()
        Simulator.useFakeTimers(false)
    })

    it('Two nodes can handshake', async () => {
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
        expect(targetNeighbors.hasNode(peerDescriptor1)).toEqual(true)
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
        expect(targetNeighbors.hasNode(peerDescriptor1)).toEqual(true)
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
        expect(targetNeighbors.hasNode(peerDescriptor1)).toEqual(false)
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
        expect(targetNeighbors.hasNode(peerDescriptor1)).toEqual(true)
        expect(targetNeighbors.hasNode(peerDescriptor3)).toEqual(true)
    })
})
