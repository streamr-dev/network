import { RpcCommunicator } from '../../src/transport/RpcCommunicator'
import { stringFromId } from '../../src/dht/helpers'
import { DhtNode } from '../../src/dht/DhtNode'
import { DhtPeer } from '../../src/dht/DhtPeer'
import { ClosestPeersRequest, PeerDescriptor, RpcWrapper, RouteMessageType } from '../../src/proto/DhtRpc'
import { waitForEvent } from 'streamr-test-utils'
import { Event as MessageRouterEvent } from '../../src/rpc-protocol/IMessageRouter'
import { createMockConnectionDhtNode } from '../utils'

describe('Route Message With Mock Connections', () => {
    let entryPoint: DhtNode
    let sourceNode: DhtNode
    let destinationNode: DhtNode
    let routerNodes: DhtNode[]

    let entryPointInfo: DhtPeer

    let rpcCommunicators: Map<string, RpcCommunicator>

    beforeEach(() => {
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
        await entryPoint.joinDht(entryPointInfo)
        await destinationNode.joinDht(entryPointInfo)
        await sourceNode.joinDht(entryPointInfo)
        await Promise.all(
            routerNodes.map((node) => node.joinDht(entryPointInfo))
        )

        const routedMessage: ClosestPeersRequest = {
            peerDescriptor: sourceNode.getPeerDescriptor(),
            nonce: '11111'
        }
        const rpcWrapper: RpcWrapper = {
            body: ClosestPeersRequest.toBinary(routedMessage),
            header: {
                method: 'closestPeersRequest',
                request: 'request'
            },
            requestId: 'testId',
            sourceDescriptor: sourceNode.getPeerDescriptor(),
            targetDescriptor: destinationNode.getPeerDescriptor()
        }
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
})