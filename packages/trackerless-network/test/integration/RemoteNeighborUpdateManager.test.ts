import { NeighborUpdate } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import {
    keyFromPeerDescriptor,
    ListeningRpcCommunicator,
    PeerDescriptor,
    Simulator,
    SimulatorTransport
} from '@streamr/dht'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import {
    NeighborUpdateRpcClient,
} from '../../src/proto/packages/trackerless-network/protos/NetworkRpc.client'
import { RemoteNeighborUpdateManager } from '../../src/logic/neighbor-discovery/RemoteNeighborUpdateManager'

describe('RemoteNeighborUpdateManager', () => {
    let mockServerRpc: ListeningRpcCommunicator
    let clientRpc: ListeningRpcCommunicator
    let neighborUpdateRpcClient: RemoteNeighborUpdateManager

    const clientPeer: PeerDescriptor = {
        kademliaId: new Uint8Array([1, 1, 1]),
        type: 1
    }
    const serverPeer: PeerDescriptor = {
        kademliaId: new Uint8Array([2, 2, 2]),
        type: 1
    }

    let simulator: Simulator
    let mockConnectionManager1: SimulatorTransport
    let mockConnectionManager2: SimulatorTransport

    beforeEach(() => {
        simulator = new Simulator()
        mockConnectionManager1 = new SimulatorTransport(serverPeer, simulator)
        mockConnectionManager2 = new SimulatorTransport(clientPeer, simulator)

        mockServerRpc = new ListeningRpcCommunicator('test', mockConnectionManager1)
        clientRpc = new ListeningRpcCommunicator('test', mockConnectionManager2)

        mockServerRpc.registerRpcMethod(
            NeighborUpdate,
            NeighborUpdate,
            'neighborUpdate',
            async (_msg: NeighborUpdate, _context: ServerCallContext): Promise<NeighborUpdate> => {
                const peer: PeerDescriptor = {
                    kademliaId: new Uint8Array([4, 2, 4]),
                    type: 0
                }

                const update: NeighborUpdate = {
                    senderId: keyFromPeerDescriptor(peer),
                    randomGraphId: 'testStream',
                    neighborDescriptors: [
                        peer
                    ],
                    removeMe: false
                }
                return update
            }
        )
        neighborUpdateRpcClient = new RemoteNeighborUpdateManager(
            serverPeer,
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
        const res = await neighborUpdateRpcClient.updateNeighbors(clientPeer, [])
        expect(res.peers.length).toEqual(1)
    })
})
