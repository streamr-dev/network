import { RpcCommunicator } from '../../src/transport/RpcCommunicator'
import { DhtNode } from '../../src/dht/DhtNode'
import { PeerDescriptor, RpcMessage, RouteMessageType } from '../../src/proto/DhtRpc'
import { waitForEvent, waitForCondition } from 'streamr-test-utils'
import { Event as MessageRouterEvent } from '../../src/rpc-protocol/IMessageRouter'
import { createMockConnectionDhtNode, createWrappedClosestPeersRequest } from '../utils'
import { PeerID } from '../../src/PeerID'

describe('Route Message With Mock Connections', () => {
    let entryPoint: DhtNode
    let sourceNode: DhtNode
    let destinationNode: DhtNode
    let routerNodes: DhtNode[]

    let entryPointDescriptor: PeerDescriptor

    let rpcCommunicators: Map<string, RpcCommunicator>

    const entryPointId = '0'
    const sourceId = 'eeeeeeeee'
    const destinationId = '000000000'

    beforeEach(async () => {
        routerNodes = []
        rpcCommunicators = new Map()
        const rpcFuntion = (senderDescriptor: PeerDescriptor) => {
            return async (targetDescriptor: PeerDescriptor, bytes: Uint8Array) => {
                if (!targetDescriptor) {
                    throw new Error('peer descriptor not set')
                }
                rpcCommunicators.get(PeerID.fromValue(targetDescriptor.peerId).toString())!.onIncomingMessage(senderDescriptor, bytes)
            }
        }

        entryPoint = createMockConnectionDhtNode(entryPointId)
        entryPoint.getRpcCommunicator().setSendFn(rpcFuntion(entryPoint.getPeerDescriptor()))
        rpcCommunicators.set(PeerID.fromString(entryPointId).toString(), entryPoint.getRpcCommunicator())

        entryPointDescriptor = {
            peerId: entryPoint.getSelfId().value,
            type: 0
        }

        sourceNode = createMockConnectionDhtNode(sourceId)
        sourceNode.getRpcCommunicator().setSendFn(rpcFuntion(sourceNode.getPeerDescriptor()))
        rpcCommunicators.set(PeerID.fromString(sourceId).toString(), sourceNode.getRpcCommunicator())

        destinationNode = createMockConnectionDhtNode(destinationId)
        destinationNode.getRpcCommunicator().setSendFn(rpcFuntion(destinationNode.getPeerDescriptor()))
        rpcCommunicators.set(PeerID.fromString(destinationId).toString(), destinationNode.getRpcCommunicator())

        for (let i = 1; i < 50; i++) {
            const nodeId = `${i}`
            const node = createMockConnectionDhtNode(nodeId)
            node.getRpcCommunicator().setSendFn(rpcFuntion(node.getPeerDescriptor()))
            rpcCommunicators.set(PeerID.fromString(nodeId).toString(), node.getRpcCommunicator())
            routerNodes.push(node)
        }
        await entryPoint.joinDht(entryPointDescriptor)
    })

    afterEach(() => {
        entryPoint.stop()
        destinationNode.stop()
        sourceNode.stop()
        routerNodes.map((node) => {
            node.stop()
        })
    })

    it ('Happy path', async () => {
        await destinationNode.joinDht(entryPointDescriptor)
        await sourceNode.joinDht(entryPointDescriptor)
        await Promise.all(
            routerNodes.map((node) => node.joinDht(entryPointDescriptor))
        )

        const rpcWrapper = createWrappedClosestPeersRequest(sourceNode.getPeerDescriptor(), destinationNode.getPeerDescriptor())
        await Promise.all([
            waitForEvent(destinationNode, MessageRouterEvent.DATA),
            sourceNode.routeMessage({
                message: RpcMessage.toBinary(rpcWrapper),
                messageType: RouteMessageType.RPC_WRAPPER,
                destinationPeer: destinationNode.getPeerDescriptor(),
                sourcePeer: sourceNode.getPeerDescriptor()
            })
        ])
    })

    it('Destination node does not exist after first hop', async () => {
        await sourceNode.joinDht(entryPointDescriptor)

        const rpcWrapper = createWrappedClosestPeersRequest(sourceNode.getPeerDescriptor(), destinationNode.getPeerDescriptor())
        await expect(sourceNode.routeMessage({
            message: RpcMessage.toBinary(rpcWrapper),
            messageType: RouteMessageType.RPC_WRAPPER,
            destinationPeer: destinationNode.getPeerDescriptor(),
            sourcePeer: sourceNode.getPeerDescriptor()
        })).rejects.toThrow()
    })

    it('Receives multiple messages', async () => {
        const numOfMessages = 100
        await sourceNode.joinDht(entryPointDescriptor)
        await destinationNode.joinDht(entryPointDescriptor)

        let receivedMessages = 0
        destinationNode.on(MessageRouterEvent.DATA, () => {
            receivedMessages += 1
        })
        const rpcWrapper = createWrappedClosestPeersRequest(sourceNode.getPeerDescriptor(), destinationNode.getPeerDescriptor())
        for (let i = 0; i < numOfMessages; i++ ) {
            sourceNode.routeMessage({
                message: RpcMessage.toBinary(rpcWrapper),
                messageType: RouteMessageType.RPC_WRAPPER,
                destinationPeer: destinationNode.getPeerDescriptor(),
                sourcePeer: sourceNode.getPeerDescriptor()
            })
        }
        await waitForCondition(() => receivedMessages === numOfMessages)
    })

    it('From all to all', async () => {
        const routers = routerNodes.splice(0, 30)
        const numsOfReceivedMessages: {[key: string]: number} = {}
        await entryPoint.joinDht(entryPointDescriptor)
        await Promise.all(
            routers.map((node) => {
                node.joinDht(entryPointDescriptor)
                numsOfReceivedMessages[node.getSelfId().toString()] = 0
                node.on(MessageRouterEvent.DATA, () => {
                    numsOfReceivedMessages[node.getSelfId().toString()] = numsOfReceivedMessages[node.getSelfId().toString()] + 1
                })
            })
        )
        await Promise.allSettled(
            routers.map(async (node) =>
                await Promise.all(routers.map(async (receiver) => {
                    if (!node.getSelfId().equals(receiver.getSelfId())) {
                        const rpcWrapper = createWrappedClosestPeersRequest(sourceNode.getPeerDescriptor(), destinationNode.getPeerDescriptor())
                        await node.routeMessage({
                            message: RpcMessage.toBinary(rpcWrapper),
                            messageType: RouteMessageType.RPC_WRAPPER,
                            destinationPeer: receiver.getPeerDescriptor(),
                            sourcePeer: node.getPeerDescriptor()
                        })
                    }
                }))
            )
        )
        await waitForCondition(() => numsOfReceivedMessages[PeerID.fromString('1').toString()] >= routers.length - 1, 10000)
        await Promise.allSettled(
            Object.values(numsOfReceivedMessages).map(async (count) =>
                await waitForCondition(() => {
                    return count >= routers.length - 1
                }, 10000)
            )
        )
    }, 20000)
})