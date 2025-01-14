import { ListeningRpcCommunicator, NodeType, PeerDescriptor, Simulator, SimulatorTransport } from '@streamr/dht'
import { StreamPartIDUtils } from '@streamr/utils'
import { NeighborUpdateRpcRemote } from '../../src/logic/neighbor-discovery/NeighborUpdateRpcRemote'
import { NeighborUpdate } from '../../generated/packages/trackerless-network/protos/NetworkRpc'
import { NeighborUpdateRpcClient } from '../../generated/packages/trackerless-network/protos/NetworkRpc.client'

describe('NeighborUpdateRpcRemote', () => {
    let mockServerRpc: ListeningRpcCommunicator
    let clientRpc: ListeningRpcCommunicator
    let rpcRemote: NeighborUpdateRpcRemote

    const clientNode: PeerDescriptor = {
        nodeId: new Uint8Array([1, 1, 1]),
        type: NodeType.NODEJS
    }
    const serverNode: PeerDescriptor = {
        nodeId: new Uint8Array([2, 2, 2]),
        type: NodeType.NODEJS
    }

    let simulator: Simulator
    let mockConnectionManager1: SimulatorTransport
    let mockConnectionManager2: SimulatorTransport

    beforeEach(async () => {
        simulator = new Simulator()
        mockConnectionManager1 = new SimulatorTransport(serverNode, simulator)
        await mockConnectionManager1.start()
        mockConnectionManager2 = new SimulatorTransport(clientNode, simulator)
        await mockConnectionManager2.start()

        mockServerRpc = new ListeningRpcCommunicator('test', mockConnectionManager1)
        clientRpc = new ListeningRpcCommunicator('test', mockConnectionManager2)

        mockServerRpc.registerRpcMethod(
            NeighborUpdate,
            NeighborUpdate,
            'neighborUpdate',
            async (): Promise<NeighborUpdate> => {
                const node: PeerDescriptor = {
                    nodeId: new Uint8Array([4, 2, 4]),
                    type: NodeType.NODEJS
                }
                const update: NeighborUpdate = {
                    streamPartId: StreamPartIDUtils.parse('stream#0'),
                    neighborDescriptors: [node],
                    removeMe: false
                }
                return update
            }
        )
        rpcRemote = new NeighborUpdateRpcRemote(clientNode, serverNode, clientRpc, NeighborUpdateRpcClient)
    })

    afterEach(async () => {
        clientRpc.stop()
        mockServerRpc.stop()
        await mockConnectionManager1.stop()
        await mockConnectionManager2.stop()
        simulator.stop()
    })

    it('updateNeighbors', async () => {
        const res = await rpcRemote.updateNeighbors(StreamPartIDUtils.parse('test#0'), [])
        expect(res.peerDescriptors.length).toEqual(1)
    })
})
