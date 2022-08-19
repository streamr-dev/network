/* eslint-disable promise/catch-or-return */
/* eslint-disable promise/always-return */
/* eslint-disable promise/no-nesting */

import { DhtNode, Events as DhtNodeEvents } from '../../src/dht/DhtNode'
import { Message, MessageType, PeerDescriptor, RpcMessage } from '../../src/proto/DhtRpc'
import { waitForEvent3 } from '../../src/helpers/waitForEvent3'
import { waitForCondition } from 'streamr-test-utils'
import { createMockConnectionDhtNode, createWrappedClosestPeersRequest } from '../utils'
import { PeerID } from '../../src/helpers/PeerID'
import { Simulator } from '../../src/connection/Simulator'

class Env {
    entryPoint?: DhtNode
    sourceNode?: DhtNode
    destinationNode?: DhtNode
    routerNodes?: DhtNode[]
    simulator = new Simulator()
    entryPointDescriptor?: PeerDescriptor

    entryPointId = '0'
    sourceId = 'eeeeeeeee'
    destinationId = '000000000'
    SERVICE_ID = 'layer0'

    async start() {
        this.routerNodes = []

        this.entryPoint = await createMockConnectionDhtNode(this.entryPointId, this.simulator)

        this.entryPointDescriptor = {
            peerId: this.entryPoint.getNodeId().value,
            type: 0
        }

        this.sourceNode = await createMockConnectionDhtNode(this.sourceId, this.simulator)
        this.destinationNode = await createMockConnectionDhtNode(this.destinationId, this.simulator)

        for (let i = 1; i < 50; i++) {
            const nodeId = `${i}`
            const node = await createMockConnectionDhtNode(nodeId, this.simulator!)
            this.routerNodes.push(node)
        }
        await this.entryPoint!.joinDht(this.entryPointDescriptor!)
    }

    async stop() {
        await this.entryPoint!.stop()
        await this.destinationNode!.stop()
        await this.sourceNode!.stop()
        await this.routerNodes!.map((node) => {
            node.stop()
        })
    }
}

describe('Route Message With Mock Connections', () => {

    it('Happy path', async () => {
        const env = new Env()
        await env.start()
        await env.destinationNode!.joinDht(env.entryPointDescriptor!)
        await env.sourceNode!.joinDht(env.entryPointDescriptor!)
        await Promise.all(
            env.routerNodes!.map((node) => node.joinDht(env.entryPointDescriptor!))
        )

        const rpcWrapper = createWrappedClosestPeersRequest(env.sourceNode!.getPeerDescriptor(), env.destinationNode!.getPeerDescriptor())
        const message: Message = {
            serviceId: env.SERVICE_ID,
            messageId: 'tsatsa',
            messageType: MessageType.RPC,
            body: RpcMessage.toBinary(rpcWrapper)
        }
        await Promise.all([
            waitForEvent3<DhtNodeEvents>(env.destinationNode!, 'DATA'),
            env.sourceNode!.doRouteMessage({
                message: Message.toBinary(message),
                destinationPeer: env.destinationNode!.getPeerDescriptor(),
                serviceId: env.SERVICE_ID,
                sourcePeer: env.sourceNode!.getPeerDescriptor()
            })
        ])
        await env.stop()
    })

    // The await expect(doSomething()).rejects.toThrow('someError') method does not work
    // in browsers, use the old non-async way

    it('Destination node does not exist after first hop', (done) => {
        const env = new Env()
        env.start()
            .then(() => {
                env.sourceNode!.joinDht(env.entryPointDescriptor!).then(() => {
                    const rpcWrapper = createWrappedClosestPeersRequest(env.sourceNode!.getPeerDescriptor(), env.destinationNode!.getPeerDescriptor())
                    const message: Message = {
                        serviceId: env.SERVICE_ID,
                        messageId: 'tsutsu',
                        messageType: MessageType.RPC,
                        body: RpcMessage.toBinary(rpcWrapper)
                    }
                    env.sourceNode!.doRouteMessage({
                        message: Message.toBinary(message),
                        destinationPeer: env.destinationNode!.getPeerDescriptor(),
                        serviceId: env.SERVICE_ID,
                        sourcePeer: env.sourceNode!.getPeerDescriptor()
                    })
                        .then(async () => {
                            await env.stop()
                            done.fail('Expected exception was not thrown')
                        })
                        .catch(async (_e) => {
                            await env.stop()
                            done()
                        })
                })
            })
    })

    it('Receives multiple messages', async () => {
        const env = new Env()
        await env.start()
        const numOfMessages = 100
        await env.sourceNode!.joinDht(env.entryPointDescriptor!)
        await env.destinationNode!.joinDht(env.entryPointDescriptor!)

        let receivedMessages = 0
        env.destinationNode!.on('DATA', () => {
            receivedMessages += 1
        })
        const rpcWrapper = createWrappedClosestPeersRequest(env.sourceNode!.getPeerDescriptor(), env.destinationNode!.getPeerDescriptor())
        const message: Message = {
            serviceId: env.SERVICE_ID,
            messageId: 'tsutsu',
            messageType: MessageType.RPC,
            body: RpcMessage.toBinary(rpcWrapper)
        }
        for (let i = 0; i < numOfMessages; i++) {
            env.sourceNode!.doRouteMessage({
                message: Message.toBinary(message),
                destinationPeer: env.destinationNode!.getPeerDescriptor(),
                serviceId: env.SERVICE_ID,
                sourcePeer: env.sourceNode!.getPeerDescriptor()
            })
        }
        await waitForCondition(() => receivedMessages === numOfMessages)
        await env.stop()
    })

    it('From all to all', async () => {
        const env = new Env()
        await env.start()
        const routers = env.routerNodes!.splice(0, 30)
        const numsOfReceivedMessages: Record<string, number> = {}
        await env.entryPoint!.joinDht(env.entryPointDescriptor!)
        await Promise.all(
            routers.map((node) => {
                node.joinDht(env.entryPointDescriptor!)
                numsOfReceivedMessages[node.getNodeId().toMapKey()] = 0
                node.on('DATA', () => {
                    numsOfReceivedMessages[node.getNodeId().toMapKey()] = numsOfReceivedMessages[node.getNodeId().toMapKey()] + 1
                })
            })
        )
        await Promise.allSettled(
            routers.map(async (node) =>
                await Promise.all(routers.map(async (receiver) => {
                    if (!node.getNodeId().equals(receiver.getNodeId())) {
                        const rpcWrapper = createWrappedClosestPeersRequest(env.sourceNode!.getPeerDescriptor(),
                            env.destinationNode!.getPeerDescriptor())
                        const message: Message = {
                            serviceId: env.SERVICE_ID,
                            messageId: 'tsutsu',
                            messageType: MessageType.RPC,
                            body: RpcMessage.toBinary(rpcWrapper)
                        }
                        await node.doRouteMessage({
                            message: Message.toBinary(message),
                            destinationPeer: receiver.getPeerDescriptor(),
                            serviceId: env.SERVICE_ID,
                            sourcePeer: node.getPeerDescriptor()
                        })
                    }
                }))
            )
        )
        await waitForCondition(() => numsOfReceivedMessages[PeerID.fromString('1').toMapKey()] >= routers.length - 1, 30000)
        await Promise.allSettled(
            Object.values(numsOfReceivedMessages).map(async (count) =>
                await waitForCondition(() => {
                    return count >= routers.length - 1
                }, 30000)
            )
        )
        await env.stop()
    }, 60000)
})
