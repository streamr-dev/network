import { Simulator, SimulatorTransport, ListeningRpcCommunicator, areEqualPeerDescriptors } from '@streamr/dht'
import { NetworkStack } from '../../src/NetworkStack'
import { createMockPeerDescriptor } from '../utils/utils'
import { InfoClient } from '../../src/logic/info-rpc/InfoClient'
import { INFO_RPC_SERVICE_ID } from '../../src/logic/info-rpc/InfoRpcLocal'
import { StreamPartIDUtils } from '@streamr/protocol'
import { waitForCondition } from '@streamr/utils'

describe('NetworkStack InfoRpc', () => {

    let stack1: NetworkStack
    let stack2: NetworkStack
    let infoClient: InfoClient
    let transport1: SimulatorTransport
    let transport2: SimulatorTransport
    let transport3: SimulatorTransport

    let simulator: Simulator

    const stack1PeerDescriptor = createMockPeerDescriptor()
    const stack2PeerDescriptor = createMockPeerDescriptor()
    const stack3PeerDescriptor = createMockPeerDescriptor()

    beforeEach(async () => {
        simulator = new Simulator()
        transport1 = new SimulatorTransport(stack1PeerDescriptor, simulator)
        transport2 = new SimulatorTransport(stack2PeerDescriptor, simulator)
        transport3 = new SimulatorTransport(stack3PeerDescriptor, simulator)
        await transport1.start()
        await transport2.start()
        await transport3.start()
        stack1 = new NetworkStack({
            layer0: {
                transport: transport1,
                peerDescriptor: stack1PeerDescriptor,
                entryPoints: [stack1PeerDescriptor]
            }
        })
        stack2 = new NetworkStack({
            layer0: {
                transport: transport2,
                peerDescriptor: stack2PeerDescriptor,
                entryPoints: [stack1PeerDescriptor]
            }
        })
        await stack1.start()
        await stack2.start()
        infoClient = new InfoClient(stack3PeerDescriptor, new ListeningRpcCommunicator(INFO_RPC_SERVICE_ID, transport3))
    })

    afterEach(async () => {
        await stack1.stop()
        await stack2.stop()
        await transport1.stop()
        await transport2.stop()
        await transport3.stop()
    })

    it('InfoClient can query NetworkStacks', async () => {
        const result = await infoClient.getInfo(stack1PeerDescriptor)
        expect(result.controlLayer).toBeDefined()
        expect(result.streamPartitions).toBeDefined()
    })

    it('InfoClient gets control layer info', async () => {
        const result = await infoClient.getInfo(stack1PeerDescriptor)
        expect(result.controlLayer).toBeDefined()
        expect(result.controlLayer!.connections.length).toEqual(2)
        expect(result.controlLayer!.neighbors.length).toEqual(1)
        expect(areEqualPeerDescriptors(result.controlLayer!.neighbors[0], stack2PeerDescriptor)).toEqual(true)
    })

    it('InfoClient gets stream partition info', async () => {
        const streamPartId1 = StreamPartIDUtils.parse('stream1#0')
        const streamPartId2 = StreamPartIDUtils.parse('stream1#1')
        await stack1.getStreamrNode().joinStreamPart(streamPartId1)
        await stack2.getStreamrNode().joinStreamPart(streamPartId1)
        await stack1.getStreamrNode().joinStreamPart(streamPartId2)
        await stack2.getStreamrNode().joinStreamPart(streamPartId2)
        await waitForCondition(() => 
            stack1.getStreamrNode().getNeighbors(streamPartId1).length === 1 
            && stack2.getStreamrNode().getNeighbors(streamPartId1).length === 1
            && stack2.getStreamrNode().getNeighbors(streamPartId2).length === 1
            && stack2.getStreamrNode().getNeighbors(streamPartId2).length === 1
        )
        const result = await infoClient.getInfo(stack1PeerDescriptor)
        expect(result.streamPartitions.length).toEqual(2)
    })

})
