import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import {
    ListeningRpcCommunicator,
    NodeType,
    PeerDescriptor,
    Simulator,
    SimulatorTransport
} from '@streamr/dht'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { RemoteNeighborUpdateManager } from '../../src/logic/neighbor-discovery/RemoteNeighborUpdateManager'
import { NeighborUpdate } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import {
    NeighborUpdateRpcClient,
} from '../../src/proto/packages/trackerless-network/protos/NetworkRpc.client'

describe('RemoteNeighborUpdateManager', () => {
    let mockServerRpc: ListeningRpcCommunicator
    let clientRpc: ListeningRpcCommunicator
    let neighborUpdateRpcClient: RemoteNeighborUpdateManager

    const clientNode: PeerDescriptor = {
        kademliaId: new Uint8Array([1, 1, 1]),
        type: NodeType.NODEJS
    }
    const serverNode: PeerDescriptor = {
        kademliaId: new Uint8Array([2, 2, 2]),
        type: NodeType.NODEJS
    }

    let simulator: Simulator
    let mockConnectionManager1: SimulatorTransport
    let mockConnectionManager2: SimulatorTransport

    beforeEach(() => {
        simulator = new Simulator()
        mockConnectionManager1 = new SimulatorTransport(serverNode, simulator)
        mockConnectionManager2 = new SimulatorTransport(clientNode, simulator)

        mockServerRpc = new ListeningRpcCommunicator('test', mockConnectionManager1)
        clientRpc = new ListeningRpcCommunicator('test', mockConnectionManager2)

        mockServerRpc.registerRpcMethod(
            NeighborUpdate,
            NeighborUpdate,
            'neighborUpdate',
            async (_msg: NeighborUpdate, _context: ServerCallContext): Promise<NeighborUpdate> => {
                const node: PeerDescriptor = {
                    kademliaId: new Uint8Array([4, 2, 4]),
                    type: NodeType.NODEJS
                }
                const update: NeighborUpdate = {
                    randomGraphId: 'testStream',
                    neighborDescriptors: [
                        node
                    ],
                    removeMe: false
                }
                return update
            }
        )
        neighborUpdateRpcClient = new RemoteNeighborUpdateManager(
            serverNode,
            'test-stream',
            toProtoRpcClient(new NeighborUpdateRpcClient(clientRpc.getRpcClientTransport()))
        )
    })

    afterEach(async () => {
        clientRpc.stop()
        mockServerRpc.stop()
        await mockConnectionManager1.stop()
        await mockConnectionManager2.stop()
        simulator.stop()
    })

    it('updateNeighbors', async () => {
        const res = await neighborUpdateRpcClient.updateNeighbors(clientNode, [])
        expect(res.peerDescriptors.length).toEqual(1)
    })
})
