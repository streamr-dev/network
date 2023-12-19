import { DhtNode, Events as DhtNodeEvents } from '../../src/dht/DhtNode'
import { Message, MessageType, NodeType, PeerDescriptor, RouteMessageWrapper } from '../../src/proto/packages/dht/protos/DhtRpc'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'
import { Logger, hexToBinary, runAndWaitForEvents3, waitForCondition } from '@streamr/utils'
import { createMockConnectionDhtNode, createWrappedClosestPeersRequest } from '../utils/utils'
import { PeerID, PeerIDKey } from '../../src/helpers/PeerID'
import { Simulator } from '../../src/connection/simulator/Simulator'
import { v4 } from 'uuid'
import { Any } from '../../src/proto/google/protobuf/any'
import { RoutingMode } from '../../src/dht/routing/RoutingSession'
import { areEqualNodeIds } from '../../src/identifiers'
import { createRandomNodeId } from '../../src/identifiers'

const logger = new Logger(module)

// TODO refactor the test to not to use PeerID
const getPeerId = (node: DhtNode) => {
    return PeerID.fromValue(hexToBinary(node.getNodeId()))
}

const NUM_NODES = 30

describe('Route Message With Mock Connections', () => {

    let entryPoint: DhtNode
    let sourceNode: DhtNode
    let destinationNode: DhtNode
    let routerNodes: DhtNode[]
    let simulator: Simulator
    let entryPointDescriptor: PeerDescriptor
    const receiveMatrix: Array<Array<number>> = []

    beforeEach(async () => {
        routerNodes = []
        simulator = new Simulator()
        entryPoint = await createMockConnectionDhtNode(simulator, createRandomNodeId())

        entryPointDescriptor = {
            nodeId: hexToBinary(entryPoint.getNodeId()),
            type: NodeType.NODEJS
        }

        sourceNode = await createMockConnectionDhtNode(simulator, createRandomNodeId())
        destinationNode = await createMockConnectionDhtNode(simulator, createRandomNodeId())

        for (let i = 1; i < NUM_NODES; i++) {
            const node = await createMockConnectionDhtNode(simulator, PeerID.fromString(`${i}`).value)
            routerNodes.push(node)
        }

        await destinationNode.joinDht([entryPointDescriptor])
        await sourceNode.joinDht([entryPointDescriptor])
        await Promise.all(routerNodes.map((node) => node.joinDht([entryPointDescriptor])))
        await entryPoint.joinDht([entryPointDescriptor])
    }, 15000)

    afterEach(async () => {
        await Promise.allSettled(routerNodes.map((node) => node.stop()))
        await Promise.allSettled([
            entryPoint.stop(),
            destinationNode.stop(),
            sourceNode.stop()
        ])

        logger.info('calling simulator stop')
        simulator.stop()
        logger.info('simulator stop called')
    }, 10000)

    it('Happy path', async () => {
        const rpcWrapper = createWrappedClosestPeersRequest(sourceNode.getLocalPeerDescriptor())
        const message: Message = {
            serviceId: 'unknown',
            messageId: v4(),
            messageType: MessageType.RPC,
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: rpcWrapper
            },
            sourceDescriptor: sourceNode.getLocalPeerDescriptor(),
            targetDescriptor: destinationNode.getLocalPeerDescriptor()
        }

        await runAndWaitForEvents3<DhtNodeEvents>([() => {
            sourceNode.router!.doRouteMessage({
                message,
                target: destinationNode.getLocalPeerDescriptor().nodeId,
                requestId: v4(),
                sourcePeer: sourceNode.getLocalPeerDescriptor(),
                reachableThrough: [],
                routingPath: []

            })
        }], [[destinationNode, 'message']], 20000)
    }, 30000)

    it('Receives multiple messages', async () => {
        const numOfMessages = 20
        let receivedMessages = 0
        destinationNode.on('message', () => {
            receivedMessages += 1
        })
        const rpcWrapper = createWrappedClosestPeersRequest(sourceNode.getLocalPeerDescriptor())

        for (let i = 0; i < numOfMessages; i++) {
            const message: Message = {
                serviceId: 'unknown',
                messageId: v4(),
                messageType: MessageType.RPC,
                body: {
                    oneofKind: 'rpcMessage',
                    rpcMessage: rpcWrapper
                },
                sourceDescriptor: sourceNode.getLocalPeerDescriptor(),
                targetDescriptor: destinationNode.getLocalPeerDescriptor()
            }
            sourceNode.router!.doRouteMessage({
                message,
                target: destinationNode.getLocalPeerDescriptor().nodeId,
                requestId: v4(),
                sourcePeer: sourceNode.getLocalPeerDescriptor(),
                reachableThrough: [],
                routingPath: []
            })
        }
        await waitForCondition(() => receivedMessages === numOfMessages)
    })

    it('From all to all', async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const i in routerNodes) {
            const arr: Array<number> = []
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            for (const j in routerNodes) {
                arr.push(0)
            }
            receiveMatrix.push(arr)
        }

        const numsOfReceivedMessages: Record<PeerIDKey, number> = {}
        routerNodes.forEach((node) => {
            numsOfReceivedMessages[getPeerId(node).toKey()] = 0
            node.on('message', (msg: Message) => {
                numsOfReceivedMessages[getPeerId(node).toKey()] = numsOfReceivedMessages[getPeerId(node).toKey()] + 1
                try {
                    const target = receiveMatrix[parseInt(getPeerId(node).toString()) - 1]
                    target[parseInt(PeerID.fromValue(msg.sourceDescriptor!.nodeId).toString()) - 1]++
                } catch (e) {
                    console.error(e)
                }
                if (parseInt(getPeerId(node).toString()) > routerNodes.length || parseInt(getPeerId(node).toString()) === 0) {
                    console.error(getPeerId(node).toString())
                }
            })
        }
        )
        await Promise.all(
            routerNodes.map(async (node) =>
                Promise.all(routerNodes.map(async (receiver) => {
                    if (!areEqualNodeIds(node.getNodeId(), receiver.getNodeId())) {
                        const rpcWrapper = createWrappedClosestPeersRequest(sourceNode.getLocalPeerDescriptor())
                        const message: Message = {
                            serviceId: 'nonexisting_service',
                            messageId: v4(),
                            messageType: MessageType.RPC,
                            body: {
                                oneofKind: 'rpcMessage',
                                rpcMessage: rpcWrapper
                            },
                            sourceDescriptor: node.getLocalPeerDescriptor(),
                            targetDescriptor: destinationNode.getLocalPeerDescriptor()
                        }
                        node.router!.doRouteMessage({
                            message,
                            target: receiver.getLocalPeerDescriptor().nodeId,
                            sourcePeer: node.getLocalPeerDescriptor(),
                            requestId: v4(),
                            reachableThrough: [],
                            routingPath: []
                        })
                    }
                }))
            )
        )
        await waitForCondition(() => numsOfReceivedMessages[PeerID.fromString('1').toKey()] >= routerNodes.length - 1
            , 30000)
        await Promise.all(
            Object.keys(numsOfReceivedMessages).map(async (key) =>
                waitForCondition(() => numsOfReceivedMessages[key as PeerIDKey] >= routerNodes.length - 1, 30000)
            )
        )

    }, 90000)

    it('Destination receives forwarded message', async () => {
        const closestPeersRequest = createWrappedClosestPeersRequest(sourceNode.getLocalPeerDescriptor())
        const closestPeersRequestMessage: Message = {
            serviceId: 'unknown',
            messageId: v4(),
            messageType: MessageType.RPC,
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: closestPeersRequest
            },
            sourceDescriptor: sourceNode.getLocalPeerDescriptor()!,
            targetDescriptor: destinationNode.getLocalPeerDescriptor()!
        }

        const routeMessageWrapper: RouteMessageWrapper = {
            message: closestPeersRequestMessage,
            target: destinationNode.getLocalPeerDescriptor().nodeId,
            requestId: v4(),
            sourcePeer: sourceNode.getLocalPeerDescriptor(),
            reachableThrough: [entryPointDescriptor],
            routingPath: []
        }

        const rpcMessage: RpcMessage = {
            body: Any.pack(routeMessageWrapper, RouteMessageWrapper),
            header: {
                method: 'routeMessage',
                request: 'request'
            },
            requestId: v4()
        }

        const requestMessage: Message = {
            serviceId: 'layer0',
            messageId: v4(),
            messageType: MessageType.RPC,
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage
            },
            sourceDescriptor: sourceNode.getLocalPeerDescriptor()!,
            targetDescriptor: entryPoint.getLocalPeerDescriptor()!
        }

        const forwardedMessage: RouteMessageWrapper = {
            message: requestMessage,
            requestId: v4(),
            sourcePeer: sourceNode.getLocalPeerDescriptor(),
            target: entryPoint.getLocalPeerDescriptor()!.nodeId,
            reachableThrough: [],
            routingPath: []
        }

        await runAndWaitForEvents3<DhtNodeEvents>([() => {
            sourceNode.router!.doRouteMessage(forwardedMessage, RoutingMode.FORWARD)
        }], [[destinationNode, 'message']])

    })

})

