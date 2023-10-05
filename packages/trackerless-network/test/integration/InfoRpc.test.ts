import { Simulator, PeerDescriptor, NodeType, SimulatorTransport, ListeningRpcCommunicator, isSamePeerDescriptor } from '@streamr/dht'
import { NetworkStack } from '../../src/NetworkStack'
import { hexToBinary } from '../../../utils/dist/src/binaryUtils'
import { createRandomNodeId } from '../utils/utils'
import { InfoClient } from '../../src/logic/info-rpc/InfoClient'
import { INFO_RPC_SERVICE_ID } from '../../src/logic/info-rpc/InfoRpcServer'
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

    const stack1PeerDescriptor: PeerDescriptor = {
        kademliaId: hexToBinary(createRandomNodeId()),
        type: NodeType.NODEJS
    }

    const stack2PeerDescriptor: PeerDescriptor = {
        kademliaId: hexToBinary(createRandomNodeId()),
        type: NodeType.NODEJS
    }

    const stack3PeerDescriptor: PeerDescriptor = {
        kademliaId: hexToBinary(createRandomNodeId()),
        type: NodeType.NODEJS
    }

    beforeEach(async () => {
        simulator = new Simulator()
        transport1 = new SimulatorTransport(stack1PeerDescriptor, simulator)
        transport2 = new SimulatorTransport(stack2PeerDescriptor, simulator)
        transport3 = new SimulatorTransport(stack3PeerDescriptor, simulator)
        stack1 = new NetworkStack({
            layer0: {
                transportLayer: transport1,
                peerDescriptor: stack1PeerDescriptor,
                entryPoints: [stack1PeerDescriptor]
            }
        })
        stack2 = new NetworkStack({
            layer0: {
                transportLayer: transport2,
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
        await transport3.stop()
    })

    it('InfoClient can query NetworkStacks', async () => {
        const result = await infoClient.getInfo(stack1PeerDescriptor, true, [])
        expect(result.controlLayerInfo).toBeDefined()
        expect(result.streamInfo).toBeDefined()
    })

    it('InfoClient can query streams', async () => {
        const streamPartId = StreamPartIDUtils.parse('stream1#0')
        await stack1.getStreamrNode().joinStream(streamPartId)
        await stack2.getStreamrNode().joinStream(streamPartId)
        await waitForCondition(() => stack1.getStreamrNode().getNeighbors(streamPartId).length === 1 
            && stack2.getStreamrNode().getNeighbors(streamPartId).length === 1)
        const result = await infoClient.getInfo(stack1PeerDescriptor, false, [streamPartId])
        expect(isSamePeerDescriptor(result.peerDescriptor!, stack1PeerDescriptor)).toEqual(true)
        expect(result.streamInfo!.streamPartitions[0].id).toEqual(streamPartId)
        expect(result.streamInfo!.streamPartitions[0].neighbors[0]).toEqual(stack2.getStreamrNode().getNodeId())
        expect(isSamePeerDescriptor(result.streamInfo!.streamPartitions[0].kBucket[0], stack2PeerDescriptor)).toEqual(true)
    })

})
