import { ListeningRpcCommunicator, PeerDescriptor, Simulator, SimulatorTransport } from '@streamr/dht'
import { StreamPartIDUtils, until } from '@streamr/utils'
import { NetworkStack } from '../../src/NetworkStack'
import { NodeInfoClient } from '../../src/logic/node-info/NodeInfoClient'
import { NODE_INFO_RPC_SERVICE_ID } from '../../src/logic/node-info/NodeInfoRpcLocal'
import { createMockPeerDescriptor } from '../utils/utils'

// TODO add Jest utility so that the normalization is not needed (NET-1254)
const normalizePeerDescriptor = (peerDescriptor: PeerDescriptor) => {
    return {
        ...peerDescriptor,
        nodeId: new Uint8Array(peerDescriptor.nodeId)
    }
}

describe('NetworkStack NodeInfoRpc', () => {
    let requesteStack: NetworkStack
    let otherStack: NetworkStack
    let nodeInfoClient: NodeInfoClient
    let requesteeTransport1: SimulatorTransport
    let otherTransport: SimulatorTransport
    let requestorTransport: SimulatorTransport

    let simulator: Simulator

    const requesteePeerDescriptor = createMockPeerDescriptor()
    const otherPeerDescriptor = createMockPeerDescriptor()
    const requestorPeerDescriptor = createMockPeerDescriptor()

    beforeEach(async () => {
        simulator = new Simulator()
        requesteeTransport1 = new SimulatorTransport(requesteePeerDescriptor, simulator)
        otherTransport = new SimulatorTransport(otherPeerDescriptor, simulator)
        requestorTransport = new SimulatorTransport(requestorPeerDescriptor, simulator)
        await requesteeTransport1.start()
        await otherTransport.start()
        await requestorTransport.start()
        requesteStack = new NetworkStack({
            layer0: {
                transport: requesteeTransport1,
                connectionsView: requesteeTransport1,
                peerDescriptor: requesteePeerDescriptor,
                entryPoints: [requesteePeerDescriptor]
            }
        })
        otherStack = new NetworkStack({
            layer0: {
                transport: otherTransport,
                connectionsView: otherTransport,
                peerDescriptor: otherPeerDescriptor,
                entryPoints: [requesteePeerDescriptor]
            }
        })
        await requesteStack.start()
        await otherStack.start()
        nodeInfoClient = new NodeInfoClient(
            requestorPeerDescriptor,
            new ListeningRpcCommunicator(NODE_INFO_RPC_SERVICE_ID, requestorTransport)
        )
    })

    afterEach(async () => {
        await requesteStack.stop()
        await otherStack.stop()
        await requesteeTransport1.stop()
        await otherTransport.stop()
        await requestorTransport.stop()
    })

    it('happy path', async () => {
        const streamPartId1 = StreamPartIDUtils.parse('stream1#0')
        const streamPartId2 = StreamPartIDUtils.parse('stream2#0')
        requesteStack.getContentDeliveryManager().joinStreamPart(streamPartId1)
        otherStack.getContentDeliveryManager().joinStreamPart(streamPartId1)
        requesteStack.getContentDeliveryManager().joinStreamPart(streamPartId2)
        otherStack.getContentDeliveryManager().joinStreamPart(streamPartId2)
        await until(
            () =>
                requesteStack.getContentDeliveryManager().getNeighbors(streamPartId1).length === 1 &&
                otherStack.getContentDeliveryManager().getNeighbors(streamPartId1).length === 1 &&
                requesteStack.getContentDeliveryManager().getNeighbors(streamPartId2).length === 1 &&
                otherStack.getContentDeliveryManager().getNeighbors(streamPartId2).length === 1
        )
        const result = await nodeInfoClient.getInfo(requesteePeerDescriptor)
        expect(result).toMatchObject({
            peerDescriptor: normalizePeerDescriptor(requesteePeerDescriptor),
            controlLayer: {
                neighbors: [normalizePeerDescriptor(otherPeerDescriptor)],
                connections: [
                    normalizePeerDescriptor(otherPeerDescriptor),
                    normalizePeerDescriptor(requestorPeerDescriptor)
                ]
            },
            streamPartitions: [
                {
                    id: streamPartId1,
                    controlLayerNeighbors: [normalizePeerDescriptor(otherPeerDescriptor)],
                    contentDeliveryLayerNeighbors: [
                        {
                            peerDescriptor: normalizePeerDescriptor(otherPeerDescriptor)
                        }
                    ]
                },
                {
                    id: streamPartId2,
                    controlLayerNeighbors: [normalizePeerDescriptor(otherPeerDescriptor)],
                    contentDeliveryLayerNeighbors: [
                        {
                            peerDescriptor: normalizePeerDescriptor(otherPeerDescriptor)
                        }
                    ]
                }
            ],
            applicationVersion: expect.any(String)
        })
        expect(result.streamPartitions.length).toEqual(2)
    })
})
