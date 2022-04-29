import { RpcCommunicator } from '../../src/transport/RpcCommunicator'
import { stringFromId } from '../../src/dht/helpers'
import { DhtNode } from '../../src/dht/DhtNode'
import { DhtPeer } from '../../src/dht/DhtPeer'
import { PeerDescriptor, RpcWrapper, RouteMessageType } from '../../src/proto/DhtRpc'
import { waitForEvent, waitForCondition } from 'streamr-test-utils'
import { Event as MessageRouterEvent } from '../../src/rpc-protocol/IMessageRouter'
import { createMockConnectionDhtNode, createWrappedClosestPeersRequest } from '../utils'

describe('Route Message With Mock Connections', () => {
    let entryPoint: DhtNode
    let sourceNode: DhtNode
    let destinationNode: DhtNode
    let routerNodes: DhtNode[]

    let entryPointInfo: DhtPeer

    let rpcCommunicators: Map<string, RpcCommunicator>

    beforeEach(async () => {
        routerNodes = []
        rpcCommunicators = new Map()
        const rpcFuntion = (senderDescriptor: PeerDescriptor) => {
            return async (targetDescriptor: PeerDescriptor, bytes: Uint8Array) => {
                if (!targetDescriptor) {
                    throw new Error('peer descriptor not set')
                }
                rpcCommunicators.get(stringFromId(targetDescriptor.peerId))!.onIncomingMessage(senderDescriptor, bytes)
            }
        }

        const entryPointId = '0'
        entryPoint = createMockConnectionDhtNode(entryPointId)
        entryPoint.getRpcCommunicator().setSendFn(rpcFuntion(entryPoint.getPeerDescriptor()))
        rpcCommunicators.set(entryPointId, entryPoint.getRpcCommunicator())

        entryPointInfo = new DhtPeer(entryPoint.getPeerDescriptor(), entryPoint.getDhtRpcClient())

        const sourceId = 'eeeeeeeee'
        sourceNode = createMockConnectionDhtNode(sourceId)
        sourceNode.getRpcCommunicator().setSendFn(rpcFuntion(sourceNode.getPeerDescriptor()))
        rpcCommunicators.set(sourceId, sourceNode.getRpcCommunicator())

        const destinationId = '000000000'
        destinationNode = createMockConnectionDhtNode(destinationId)
        destinationNode.getRpcCommunicator().setSendFn(rpcFuntion(destinationNode.getPeerDescriptor()))
        rpcCommunicators.set(destinationId, destinationNode.getRpcCommunicator())

        for (let i = 1; i < 50; i++) {
            const nodeId = `${i}`
            const node = createMockConnectionDhtNode(nodeId)
            node.getRpcCommunicator().setSendFn(rpcFuntion(node.getPeerDescriptor()))
            rpcCommunicators.set(nodeId, node.getRpcCommunicator())
            routerNodes.push(node)
        }
        await entryPoint.joinDht(entryPointInfo)
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
        await destinationNode.joinDht(entryPointInfo)
        await sourceNode.joinDht(entryPointInfo)
        await Promise.all(
            routerNodes.map((node) => node.joinDht(entryPointInfo))
        )

        const rpcWrapper = createWrappedClosestPeersRequest(sourceNode.getPeerDescriptor(), destinationNode.getPeerDescriptor())
        await Promise.all([
            waitForEvent(destinationNode, MessageRouterEvent.DATA),
            sourceNode.routeMessage({
                message: RpcWrapper.toBinary(rpcWrapper),
                messageType: RouteMessageType.RPC_WRAPPER,
                destinationPeer: destinationNode.getPeerDescriptor(),
                sourcePeer: sourceNode.getPeerDescriptor()
            })
        ])
    })

    it('Destination node does not exist after first hop', async () => {
        await sourceNode.joinDht(entryPointInfo)

        const rpcWrapper = createWrappedClosestPeersRequest(sourceNode.getPeerDescriptor(), destinationNode.getPeerDescriptor())
        await expect(sourceNode.routeMessage({
            message: RpcWrapper.toBinary(rpcWrapper),
            messageType: RouteMessageType.RPC_WRAPPER,
            destinationPeer: destinationNode.getPeerDescriptor(),
            sourcePeer: sourceNode.getPeerDescriptor()
        })).rejects.toEqual(new Error('Could not route message forward'))
    })

    it('Receives multiple messages', async () => {
        const numOfMessages = 100
        await sourceNode.joinDht(entryPointInfo)
        await destinationNode.joinDht(entryPointInfo)

        let receivedMessages = 0
        destinationNode.on(MessageRouterEvent.DATA, () => {
            receivedMessages += 1
        })
        const rpcWrapper = createWrappedClosestPeersRequest(sourceNode.getPeerDescriptor(), destinationNode.getPeerDescriptor())
        for (let i = 0; i < numOfMessages; i++ ) {
            sourceNode.routeMessage({
                message: RpcWrapper.toBinary(rpcWrapper),
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
        await entryPoint.joinDht(entryPointInfo)
        await Promise.all(
            routers.map((node) => {
                node.joinDht(entryPointInfo)
                numsOfReceivedMessages[stringFromId(node.getSelfId())] = 0
                node.on(MessageRouterEvent.DATA, () => {
                    numsOfReceivedMessages[stringFromId(node.getSelfId())] = numsOfReceivedMessages[stringFromId(node.getSelfId())] + 1
                })
            })
        )
        await Promise.allSettled(
            routers.map(async (node) =>
                await Promise.all(routers.map(async (receiver) => {
                    if (stringFromId(node.getSelfId()) != stringFromId(receiver.getSelfId())) {
                        const rpcWrapper = createWrappedClosestPeersRequest(sourceNode.getPeerDescriptor(), destinationNode.getPeerDescriptor())
                        await node.routeMessage({
                            message: RpcWrapper.toBinary(rpcWrapper),
                            messageType: RouteMessageType.RPC_WRAPPER,
                            destinationPeer: receiver.getPeerDescriptor(),
                            sourcePeer: node.getPeerDescriptor()
                        })
                    }
                }))
            )
        )
        await waitForCondition(() => numsOfReceivedMessages['1'] >= routers.length - 1, 10000)
        await Promise.allSettled(
            Object.values(numsOfReceivedMessages).map(async (count) =>
                await waitForCondition(() => {
                    return count === routers.length
                }, 10000)
            )
        )
    }, 20000)
})