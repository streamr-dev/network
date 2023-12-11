import { Handshaker } from '../../src/logic/neighbor-discovery/Handshaker'
import {
    NodeType,
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
import { StreamPartHandshakeRequest, StreamPartHandshakeResponse } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { HandshakeRpcRemote } from '../../src/logic/neighbor-discovery/HandshakeRpcRemote'
import { getNodeIdFromPeerDescriptor } from '../../src/identifiers'
import { StreamPartIDUtils } from '@streamr/protocol'

describe('Handshakes', () => {

    const peerDescriptor1: PeerDescriptor = {
        nodeId: new Uint8Array([1, 1, 1]),
        type: NodeType.NODEJS
    }
    const peerDescriptor2: PeerDescriptor = {
        nodeId: new Uint8Array([2, 1, 1]),
        type: NodeType.NODEJS
    }
    const peerDescriptor3: PeerDescriptor = {
        nodeId: new Uint8Array([3, 1, 1]),
        type: NodeType.NODEJS
    }
    let rpcCommunicator1: ListeningRpcCommunicator
    let rpcCommunicator2: ListeningRpcCommunicator
    let rpcCommunicator3: ListeningRpcCommunicator
    let nodeView: NodeList
    let targetNeighbors: NodeList
    let handshaker: Handshaker
    const streamPartId = StreamPartIDUtils.parse('stream#0')

    const acceptHandshake = async (request: StreamPartHandshakeRequest): Promise<StreamPartHandshakeResponse> => {
        const response: StreamPartHandshakeResponse = {
            requestId: request.requestId,
            accepted: true
        }
        return response
    }

    const rejectHandshake = async (request: StreamPartHandshakeRequest): Promise<StreamPartHandshakeResponse> => {
        const response: StreamPartHandshakeResponse = {
            requestId: request.requestId,
            accepted: false
        }
        return response
    }

    const interleavingHandshake = async (request: StreamPartHandshakeRequest): Promise<StreamPartHandshakeResponse> => {
        const response: StreamPartHandshakeResponse = {
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

    beforeEach(async () => {
        simulator = new Simulator()
        simulatorTransport1 = new SimulatorTransport(peerDescriptor1, simulator)
        await simulatorTransport1.start()
        simulatorTransport2 = new SimulatorTransport(peerDescriptor2, simulator)
        await simulatorTransport2.start()
        simulatorTransport3 = new SimulatorTransport(peerDescriptor3, simulator)
        await simulatorTransport3.start()

        rpcCommunicator1 = new ListeningRpcCommunicator(streamPartId, simulatorTransport1)
        rpcCommunicator2 = new ListeningRpcCommunicator(streamPartId, simulatorTransport2)
        rpcCommunicator3 = new ListeningRpcCommunicator(streamPartId, simulatorTransport3)

        const handshakerNodeId = getNodeIdFromPeerDescriptor(peerDescriptor2)
        nodeView = new NodeList(handshakerNodeId, 10)
        targetNeighbors = new NodeList(handshakerNodeId, 4)
        handshaker = new Handshaker({
            localPeerDescriptor: peerDescriptor2,
            streamPartId,
            nearbyNodeView: nodeView,
            randomNodeView: nodeView,
            targetNeighbors,
            connectionLocker: mockConnectionLocker,
            rpcCommunicator: rpcCommunicator2,
            maxNeighborCount: 4
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
    })

    it('Two nodes can handshake', async () => {
        rpcCommunicator1.registerRpcMethod(StreamPartHandshakeRequest, StreamPartHandshakeResponse, 'handshake', acceptHandshake)
        // @ts-expect-error private
        const res = await handshaker.handshakeWithTarget(
            new HandshakeRpcRemote(
                peerDescriptor2,
                peerDescriptor1,
                streamPartId,
                toProtoRpcClient(new HandshakeRpcClient(rpcCommunicator2.getRpcClientTransport()))
            )
        )
        expect(res).toEqual(true)
        expect(targetNeighbors.hasNode(peerDescriptor1)).toEqual(true)
    })

    it('Handshake accepted', async () => {
        rpcCommunicator1.registerRpcMethod(StreamPartHandshakeRequest, StreamPartHandshakeResponse, 'handshake', acceptHandshake)
        // @ts-expect-error private
        const res = await handshaker.handshakeWithTarget(
            new HandshakeRpcRemote(
                peerDescriptor2,
                peerDescriptor1,
                streamPartId,
                toProtoRpcClient(new HandshakeRpcClient(rpcCommunicator2.getRpcClientTransport()))
            )
        )
        expect(res).toEqual(true)
        expect(targetNeighbors.hasNode(peerDescriptor1)).toEqual(true)
    })

    it('Handshake rejected', async () => {
        rpcCommunicator1.registerRpcMethod(StreamPartHandshakeRequest, StreamPartHandshakeResponse, 'handshake', rejectHandshake)
        // @ts-expect-error private
        const res = await handshaker.handshakeWithTarget(
            new HandshakeRpcRemote(
                peerDescriptor2,
                peerDescriptor1,
                streamPartId,
                toProtoRpcClient(new HandshakeRpcClient(rpcCommunicator2.getRpcClientTransport()))
            )
        )
        expect(res).toEqual(false)
        expect(targetNeighbors.hasNode(peerDescriptor1)).toEqual(false)
    })

    it('Handshake with Interleaving', async () => {
        rpcCommunicator1.registerRpcMethod(StreamPartHandshakeRequest, StreamPartHandshakeResponse, 'handshake', interleavingHandshake)
        rpcCommunicator3.registerRpcMethod(StreamPartHandshakeRequest, StreamPartHandshakeResponse, 'handshake', acceptHandshake)
        // @ts-expect-error private
        const res = await handshaker.handshakeWithTarget(
            new HandshakeRpcRemote(
                peerDescriptor2,
                peerDescriptor1,
                streamPartId,
                toProtoRpcClient(new HandshakeRpcClient(rpcCommunicator2.getRpcClientTransport()))
            )
        )
        expect(res).toEqual(true)
        expect(targetNeighbors.hasNode(peerDescriptor1)).toEqual(true)
        expect(targetNeighbors.hasNode(peerDescriptor3)).toEqual(true)
    })
})
