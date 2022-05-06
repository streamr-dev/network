import { RpcCommunicator } from '../../src/transport/RpcCommunicator'
import { DhtNode } from '../../src/dht/DhtNode'
import { Message, MessageType, PeerDescriptor, RpcMessage } from '../../src/proto/DhtRpc'
import { waitForCondition, waitForEvent } from 'streamr-test-utils'
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
    const APP_ID = 'layer0'

    beforeEach(async () => {
        routerNodes = []
        rpcCommunicators = new Map()
        const rpcFuntion = (senderDescriptor: PeerDescriptor) => {
            return async (targetDescriptor: PeerDescriptor, message: Message) => {
                if (!targetDescriptor) {
                    throw new Error('peer descriptor not set')
                }
                rpcCommunicators.get(PeerID.fromValue(targetDescriptor.peerId).toString())!.onIncomingMessage(senderDescriptor, message)
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
        const message: Message = {
            messageId: 'tsatsa',
            messageType: MessageType.RPC,
            body: RpcMessage.toBinary(rpcWrapper)
        }
        await Promise.all([
            waitForEvent(destinationNode, MessageRouterEvent.DATA),
            sourceNode.routeMessage({
                message: Message.toBinary(message),
                destinationPeer: destinationNode.getPeerDescriptor(),
                appId: APP_ID,
                sourcePeer: sourceNode.getPeerDescriptor()
            })
        ])
    })

    it('Destination node does not exist after first hop', async () => {
        await sourceNode.joinDht(entryPointDescriptor)

        const rpcWrapper = createWrappedClosestPeersRequest(sourceNode.getPeerDescriptor(), destinationNode.getPeerDescriptor())
        const message: Message = {
            messageId: 'tsutsu',
            messageType: MessageType.RPC,
            body: RpcMessage.toBinary(rpcWrapper)
        }
        await expect(sourceNode.routeMessage({
            message: Message.toBinary(message),
            destinationPeer: destinationNode.getPeerDescriptor(),
            appId: APP_ID,
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
        const message: Message = {
            messageId: 'tsutsu',
            messageType: MessageType.RPC,
            body: RpcMessage.toBinary(rpcWrapper)
        }
        for (let i = 0; i < numOfMessages; i++ ) {
            sourceNode.routeMessage({
                message: Message.toBinary(message),
                destinationPeer: destinationNode.getPeerDescriptor(),
                appId: APP_ID,
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
                        const message: Message = {
                            messageId: 'tsutsu',
                            messageType: MessageType.RPC,
                            body: RpcMessage.toBinary(rpcWrapper)
                        }
                        await node.routeMessage({
                            message: Message.toBinary(message),
                            destinationPeer: receiver.getPeerDescriptor(),
                            appId: APP_ID,
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