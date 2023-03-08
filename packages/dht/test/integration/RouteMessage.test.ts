import { DhtNode, Events as DhtNodeEvents } from '../../src/dht/DhtNode'
import { Message, MessageType, PeerDescriptor, RouteMessageWrapper } from '../../src/proto/packages/dht/protos/DhtRpc'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'
import { Logger, runAndWaitForEvents3, waitForCondition } from '@streamr/utils'
import { createMockConnectionDhtNode, createWrappedClosestPeersRequest } from '../utils'
import { PeerID } from '../../src/helpers/PeerID'
import { Simulator } from '../../src/connection/Simulator/Simulator'
import { v4 } from 'uuid'
import { UUID } from '../../src/helpers/UUID'
import { Any } from '../../src/proto/google/protobuf/any'
import { RoutingMode } from '../../src/dht/routing/RoutingSession'

const logger = new Logger(module)

describe('Route Message With Mock Connections', () => {
    let entryPoint: DhtNode
    let sourceNode: DhtNode
    let destinationNode: DhtNode
    let routerNodes: DhtNode[]
    let simulator: Simulator
    let entryPointDescriptor: PeerDescriptor

    const entryPointId = '0'
    const sourceId = 'eeeeeeeee'
    const destinationId = '000000000'
    const NUM_NODES = 30

    const receiveMatrix: Array<Array<number>> = []

    beforeEach(async () => {
        routerNodes = []
        simulator = new Simulator()
        entryPoint = await createMockConnectionDhtNode(entryPointId, simulator)

        entryPointDescriptor = {
            kademliaId: entryPoint.getNodeId().value,
            nodeName: 'entrypoint',
            type: 0
        }

        sourceNode = await createMockConnectionDhtNode(sourceId, simulator)
        destinationNode = await createMockConnectionDhtNode(destinationId, simulator)

        for (let i = 1; i < NUM_NODES; i++) {
            const nodeId = `${i}`
            const node = await createMockConnectionDhtNode(nodeId, simulator)
            routerNodes.push(node)
        }

        await destinationNode.joinDht(entryPointDescriptor)
        await sourceNode.joinDht(entryPointDescriptor)
        await Promise.all(routerNodes.map((node) => node.joinDht(entryPointDescriptor)))
        await entryPoint.joinDht(entryPointDescriptor)
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
    })

    it('Happy path', async () => {
        const rpcWrapper = createWrappedClosestPeersRequest(sourceNode.getPeerDescriptor(), destinationNode.getPeerDescriptor())
        const message: Message = {
            serviceId: 'unknown',
            messageId: v4(),
            messageType: MessageType.RPC,
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: rpcWrapper
            },
            sourceDescriptor: sourceNode.getPeerDescriptor(),
            targetDescriptor: destinationNode.getPeerDescriptor()
        }

        await runAndWaitForEvents3<DhtNodeEvents>([() => {
            sourceNode.router!.doRouteMessage({
                message: message,
                destinationPeer: destinationNode.getPeerDescriptor(),
                requestId: v4(),
                sourcePeer: sourceNode.getPeerDescriptor(),
                reachableThrough: [],
                routingPath: []

            })
        }], [[destinationNode, 'message']], 20000)
    }, 30000)

    it('Receives multiple messages', async () => {
        const numOfMessages = 20
        let receivedMessages = 0
        destinationNode.on('message', (_message: Message) => {
            receivedMessages += 1
        })
        const rpcWrapper = createWrappedClosestPeersRequest(sourceNode.getPeerDescriptor(), destinationNode.getPeerDescriptor())

        for (let i = 0; i < numOfMessages; i++) {
            const message: Message = {
                serviceId: 'unknown',
                messageId: v4(),
                messageType: MessageType.RPC,
                body: {
                    oneofKind: 'rpcMessage',
                    rpcMessage: rpcWrapper
                },
                sourceDescriptor: sourceNode.getPeerDescriptor(),
                targetDescriptor: destinationNode.getPeerDescriptor()
            }
            await sourceNode.router!.doRouteMessage({
                message: message,
                destinationPeer: destinationNode.getPeerDescriptor(),
                requestId: v4(),
                sourcePeer: sourceNode.getPeerDescriptor(),
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

        const numsOfReceivedMessages: Record<string, number> = {}
        routerNodes.map((node) => {
            numsOfReceivedMessages[node.getNodeId().toKey()] = 0
            node.on('message', (msg: Message) => {
                numsOfReceivedMessages[node.getNodeId().toKey()] = numsOfReceivedMessages[node.getNodeId().toKey()] + 1
                try {
                    const target = receiveMatrix[parseInt(node.getNodeId().toString()) - 1]
                    target[parseInt(PeerID.fromValue(msg.sourceDescriptor!.kademliaId!).toString()) - 1]++
                } catch (e) {
                    console.error(e)
                }
                if (parseInt(node.getNodeId().toString()) > routerNodes.length || parseInt(node.getNodeId().toString()) < 1) {
                    console.error(node.getNodeId().toString())
                }
            })
        }
        )
        await Promise.all(
            routerNodes.map(async (node) =>
                Promise.all(routerNodes.map(async (receiver) => {
                    if (!node.getNodeId().equals(receiver.getNodeId())) {
                        const rpcWrapper = createWrappedClosestPeersRequest(sourceNode.getPeerDescriptor(), destinationNode.getPeerDescriptor())
                        const message: Message = {
                            serviceId: 'nonexisting_service',
                            messageId: v4(),
                            messageType: MessageType.RPC,
                            body: {
                                oneofKind: 'rpcMessage',
                                rpcMessage: rpcWrapper
                            },
                            sourceDescriptor: node.getPeerDescriptor(),
                            targetDescriptor: destinationNode.getPeerDescriptor()
                        }
                        await node.router!.doRouteMessage({
                            message: message,
                            destinationPeer: receiver.getPeerDescriptor(),
                            sourcePeer: node.getPeerDescriptor(),
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
                waitForCondition(() => numsOfReceivedMessages[key] >= routerNodes.length - 1, 30000)
            )
        )

    }, 90000)

    it('Destination receives forwarded message', async () => {
        const closestPeersRequest = createWrappedClosestPeersRequest(sourceNode.getPeerDescriptor(), destinationNode.getPeerDescriptor())
        const closestPeersRequestMessage: Message = {
            serviceId: 'unknown',
            messageId: v4(),
            messageType: MessageType.RPC,
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: closestPeersRequest
            },
            sourceDescriptor: sourceNode.getPeerDescriptor()!,
            targetDescriptor: destinationNode.getPeerDescriptor()!
        }

        const routeMessageWrapper: RouteMessageWrapper = {
            message: closestPeersRequestMessage,
            destinationPeer: destinationNode.getPeerDescriptor(),
            requestId: new UUID().toString(),
            sourcePeer: sourceNode.getPeerDescriptor(),
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
                rpcMessage: rpcMessage
            },
            sourceDescriptor: sourceNode.getPeerDescriptor()!,
            targetDescriptor: entryPoint.getPeerDescriptor()!
        }

        const forwardedMessage: RouteMessageWrapper = {
            message: requestMessage,
            requestId: v4(),
            sourcePeer: sourceNode.getPeerDescriptor(),
            destinationPeer: entryPoint.getPeerDescriptor()!,
            reachableThrough: [],
            routingPath: []
        }

        await runAndWaitForEvents3<DhtNodeEvents>([() => {
            sourceNode.router!.doRouteMessage(forwardedMessage, RoutingMode.FORWARD)
        }], [[destinationNode, 'message']])

    })

})

