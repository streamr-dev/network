import { DhtNode, Events as DhtNodeEvents } from '../../src/dht/DhtNode'
import { Message, NodeType, PeerDescriptor, RouteMessageWrapper } from '../../generated/packages/dht/protos/DhtRpc'
import { RpcMessage } from '../../generated/packages/proto-rpc/protos/ProtoRpc'
import { Logger, runAndWaitForEvents3, until } from '@streamr/utils'
import { createMockConnectionDhtNode, createWrappedClosestPeersRequest } from '../utils/utils'
import { Simulator } from '../../src/connection/simulator/Simulator'
import { v4 } from 'uuid'
import { Any } from '../../generated/google/protobuf/any'
import { RoutingMode } from '../../src/dht/routing/RoutingSession'
import { DhtAddress, randomDhtAddress, toDhtAddressRaw } from '../../src/identifiers'

const logger = new Logger(module)

const NUM_NODES = 30

describe('Route Message With Mock Connections', () => {
    let entryPoint: DhtNode
    let sourceNode: DhtNode
    let destinationNode: DhtNode
    let routerNodes: DhtNode[]
    let simulator: Simulator
    let entryPointDescriptor: PeerDescriptor

    beforeEach(async () => {
        routerNodes = []
        simulator = new Simulator()
        entryPoint = await createMockConnectionDhtNode(simulator, randomDhtAddress())

        entryPointDescriptor = {
            nodeId: toDhtAddressRaw(entryPoint.getNodeId()),
            type: NodeType.NODEJS
        }

        sourceNode = await createMockConnectionDhtNode(simulator, randomDhtAddress())
        destinationNode = await createMockConnectionDhtNode(simulator, randomDhtAddress())

        for (let i = 1; i < NUM_NODES; i++) {
            const node = await createMockConnectionDhtNode(simulator, randomDhtAddress())
            routerNodes.push(node)
        }

        await destinationNode.joinDht([entryPointDescriptor])
        await sourceNode.joinDht([entryPointDescriptor])
        await Promise.all(routerNodes.map((node) => node.joinDht([entryPointDescriptor])))
        await entryPoint.joinDht([entryPointDescriptor])
    }, 15000)

    afterEach(async () => {
        await Promise.allSettled(routerNodes.map((node) => node.stop()))
        await Promise.allSettled([entryPoint.stop(), destinationNode.stop(), sourceNode.stop()])

        logger.info('calling simulator stop')
        simulator.stop()
        logger.info('simulator stop called')
    }, 10000)

    it('Happy path', async () => {
        const rpcWrapper = createWrappedClosestPeersRequest(sourceNode.getLocalPeerDescriptor())
        const message: Message = {
            serviceId: 'unknown',
            messageId: v4(),
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: rpcWrapper
            },
            sourceDescriptor: sourceNode.getLocalPeerDescriptor(),
            targetDescriptor: destinationNode.getLocalPeerDescriptor()
        }

        await runAndWaitForEvents3<DhtNodeEvents>(
            [
                () => {
                    // @ts-expect-error private
                    sourceNode.router!.doRouteMessage({
                        message,
                        target: destinationNode.getLocalPeerDescriptor().nodeId,
                        requestId: v4(),
                        sourcePeer: sourceNode.getLocalPeerDescriptor(),
                        reachableThrough: [],
                        routingPath: [],
                        parallelRootNodeIds: []
                    })
                }
            ],
            [[destinationNode, 'message']],
            20000
        )
    }, 30000)

    it('Receives multiple messages', async () => {
        const messageCount = 20
        let receivedMessages = 0
        destinationNode.on('message', () => {
            receivedMessages += 1
        })
        const rpcWrapper = createWrappedClosestPeersRequest(sourceNode.getLocalPeerDescriptor())

        for (let i = 0; i < messageCount; i++) {
            const message: Message = {
                serviceId: 'unknown',
                messageId: v4(),
                body: {
                    oneofKind: 'rpcMessage',
                    rpcMessage: rpcWrapper
                },
                sourceDescriptor: sourceNode.getLocalPeerDescriptor(),
                targetDescriptor: destinationNode.getLocalPeerDescriptor()
            }
            // @ts-expect-error private
            sourceNode.router!.doRouteMessage({
                message,
                target: destinationNode.getLocalPeerDescriptor().nodeId,
                requestId: v4(),
                sourcePeer: sourceNode.getLocalPeerDescriptor(),
                reachableThrough: [],
                routingPath: [],
                parallelRootNodeIds: []
            })
        }
        await until(() => receivedMessages === messageCount)
    })

    it('From all to all', async () => {
        const receivedMessageCounts: Record<DhtAddress, number> = {}
        routerNodes.forEach((node) => {
            const key = node.getNodeId()
            receivedMessageCounts[key] = 0
            node.on('message', () => {
                receivedMessageCounts[key] = receivedMessageCounts[key] + 1
            })
        })
        await Promise.all(
            routerNodes.map(async (node) =>
                Promise.all(
                    routerNodes.map(async (receiver) => {
                        if (node.getNodeId() !== receiver.getNodeId()) {
                            const rpcWrapper = createWrappedClosestPeersRequest(sourceNode.getLocalPeerDescriptor())
                            const message: Message = {
                                serviceId: 'nonexisting_service',
                                messageId: v4(),
                                body: {
                                    oneofKind: 'rpcMessage',
                                    rpcMessage: rpcWrapper
                                },
                                sourceDescriptor: node.getLocalPeerDescriptor(),
                                targetDescriptor: destinationNode.getLocalPeerDescriptor()
                            }
                            // @ts-expect-error private
                            node.router!.doRouteMessage({
                                message,
                                target: receiver.getLocalPeerDescriptor().nodeId,
                                sourcePeer: node.getLocalPeerDescriptor(),
                                requestId: v4(),
                                reachableThrough: [],
                                routingPath: [],
                                parallelRootNodeIds: []
                            })
                        }
                    })
                )
            )
        )
        await until(() => receivedMessageCounts[routerNodes[0].getNodeId()] >= routerNodes.length - 1, 30000)
        await Promise.all(
            Object.keys(receivedMessageCounts).map(async (key) =>
                until(() => receivedMessageCounts[key as DhtAddress] >= routerNodes.length - 1, 30000)
            )
        )
    }, 90000)

    it('Destination receives forwarded message', async () => {
        const closestPeersRequest = createWrappedClosestPeersRequest(sourceNode.getLocalPeerDescriptor())
        const closestPeersRequestMessage: Message = {
            serviceId: 'unknown',
            messageId: v4(),
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: closestPeersRequest
            },
            sourceDescriptor: sourceNode.getLocalPeerDescriptor(),
            targetDescriptor: destinationNode.getLocalPeerDescriptor()
        }

        const routeMessageWrapper: RouteMessageWrapper = {
            message: closestPeersRequestMessage,
            target: destinationNode.getLocalPeerDescriptor().nodeId,
            requestId: v4(),
            sourcePeer: sourceNode.getLocalPeerDescriptor(),
            reachableThrough: [entryPointDescriptor],
            routingPath: [],
            parallelRootNodeIds: []
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
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage
            },
            sourceDescriptor: sourceNode.getLocalPeerDescriptor(),
            targetDescriptor: entryPoint.getLocalPeerDescriptor()
        }

        const forwardedMessage: RouteMessageWrapper = {
            message: requestMessage,
            requestId: v4(),
            sourcePeer: sourceNode.getLocalPeerDescriptor(),
            target: entryPoint.getLocalPeerDescriptor().nodeId,
            reachableThrough: [],
            routingPath: [],
            parallelRootNodeIds: []
        }

        await runAndWaitForEvents3<DhtNodeEvents>(
            [
                () => {
                    // @ts-expect-error private
                    sourceNode.router!.doRouteMessage(forwardedMessage, RoutingMode.FORWARD)
                }
            ],
            [[destinationNode, 'message']]
        )
    })
})
