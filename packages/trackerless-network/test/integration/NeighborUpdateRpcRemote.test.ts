import { ListeningRpcCommunicator, Simulator, SimulatorTransport } from '@streamr/dht'
import { StreamPartIDUtils } from '@streamr/utils'
import { NeighborUpdateRpcRemote } from '../../src/logic/neighbor-discovery/NeighborUpdateRpcRemote'
import { NeighborUpdate } from '../../generated/packages/trackerless-network/protos/NetworkRpc'
import {
    NeighborUpdateRpcClient,
} from '../../generated/packages/trackerless-network/protos/NetworkRpc.client'
import { createMockPeerDescriptor } from '../utils/utils'

describe('NeighborUpdateRpcRemote', () => {
    let mockServerRpc: ListeningRpcCommunicator
    let clientRpc: ListeningRpcCommunicator
    let rpcRemote: NeighborUpdateRpcRemote

    const clientNode = createMockPeerDescriptor()
    const serverNode = createMockPeerDescriptor()

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
                const node = createMockPeerDescriptor()
                const update: NeighborUpdate = {
                    streamPartId: StreamPartIDUtils.parse('stream#0'),
                    neighborDescriptors: [
                        node
                    ],
                    removeMe: false
                }
                return update
            }
        )
        rpcRemote = new NeighborUpdateRpcRemote(
            clientNode,
            serverNode,
            clientRpc,
            NeighborUpdateRpcClient
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
        const res = await rpcRemote.updateNeighbors(StreamPartIDUtils.parse('test#0'), [])
        expect(res.peerDescriptors.length).toEqual(1)
    })
})
