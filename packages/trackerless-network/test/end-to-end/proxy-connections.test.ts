import { NodeType, PeerDescriptor } from '@streamr/dht'
import { MessageID, MessageRef, StreamMessage, StreamMessageType, toStreamID, toStreamPartID } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { hexToBinary, waitForCondition, waitForEvent3 } from '@streamr/utils'
import { NetworkNode, createNetworkNode } from '../../src/NetworkNode'
import { NodeID } from '../../src/identifiers'
import { ProxyDirection } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { createRandomNodeId } from '../utils/utils'
import { RandomGraphNode } from '../../src/logic/RandomGraphNode'
import { ProxyStreamConnectionClient } from '../../src/logic/proxy/ProxyStreamConnectionClient'

const PROXIED_NODE_USER_ID = randomEthereumAddress()

const STREAM_PART_ID = toStreamPartID(toStreamID('proxy-test'), 0)
const MESSAGE = new StreamMessage({
    messageId: new MessageID(
        toStreamID('proxy-test'),
        0,
        666,
        0,
        randomEthereumAddress(),
        'msgChainId'
    ),
    prevMsgRef: new MessageRef(665, 0),
    content: {
        hello: 'world'
    },
    messageType: StreamMessageType.MESSAGE,
    signature: hexToBinary('0x1234')
})

describe('Proxy connections', () => {

    let proxyNode1: NetworkNode
    let proxyNode2: NetworkNode
    let proxiedNode: NetworkNode

    const hasConnectionFromProxy = (proxyNode: NetworkNode, proxiedNodeId_: NodeID, direction: ProxyDirection): boolean => {
        const delivery = proxyNode.stack.getStreamrNode()!.getStream(STREAM_PART_ID)
        return (delivery !== undefined)
            ? (delivery!.layer2 as RandomGraphNode).hasProxyConnection(proxiedNodeId_)
            : false
    }
    
    const hasConnectionToProxy = (proxiedNode: NetworkNode, proxyNodeId_: NodeID, direction: ProxyDirection): boolean => {
        const client = proxiedNode.stack.getStreamrNode()!.getStream(STREAM_PART_ID)!.layer2 as ProxyStreamConnectionClient
        return client.hasProxyConnection(proxyNodeId_, direction)
    }

    beforeEach(async () => {
        const proxyNodeDescriptor1: PeerDescriptor = {
            kademliaId: hexToBinary(createRandomNodeId()),
            type: NodeType.NODEJS,
            nodeName: 'proxyNode',
            websocket: { host: 'localhost', port: 23132, tls: false }
        }
        const proxyNodeDescriptor2: PeerDescriptor = {
            kademliaId: hexToBinary(createRandomNodeId()),
            type: NodeType.NODEJS,
            nodeName: 'proxyNode',
            websocket: { host: 'localhost', port: 23133, tls: false }
        }
        const proxiedNodeDescriptor: PeerDescriptor = {
            kademliaId: hexToBinary(createRandomNodeId()),
            type: NodeType.NODEJS,
        }
        proxyNode1 = createNetworkNode({
            layer0: {
                entryPoints: [proxyNodeDescriptor1],
                peerDescriptor: proxyNodeDescriptor1,
            },
            networkNode: {
                acceptProxyConnections: true
            }
        })
        await proxyNode1.start()
        proxyNode1.setStreamPartEntryPoints(STREAM_PART_ID, [proxyNodeDescriptor1])
        await proxyNode1.stack.getStreamrNode()!.joinStream(STREAM_PART_ID)
       
        proxyNode2 = createNetworkNode({
            layer0: {
                entryPoints: [proxyNodeDescriptor1],
                peerDescriptor: proxyNodeDescriptor2,
            },
            networkNode: {
                acceptProxyConnections: true
            }
        })
        await proxyNode2.start()
        proxyNode2.setStreamPartEntryPoints(STREAM_PART_ID, [proxyNodeDescriptor1])
        await proxyNode2.stack.getStreamrNode()!.joinStream(STREAM_PART_ID)

        proxiedNode = createNetworkNode({
            layer0: {
                entryPoints: [proxyNode1.getPeerDescriptor()],
                peerDescriptor: proxiedNodeDescriptor,
            }
        })
        await proxiedNode.start(false)
    }, 30000)

    afterEach(async () => {
        await proxyNode1.stop()
        await proxyNode2.stop()
        await proxiedNode.stop()
    })

    it('happy path publishing', async () => {
        await proxiedNode.setProxies(STREAM_PART_ID, [proxyNode1.getPeerDescriptor()], ProxyDirection.PUBLISH, PROXIED_NODE_USER_ID, 1)
        await Promise.all([
            waitForEvent3(proxyNode1.stack.getStreamrNode()! as any, 'newMessage'),
            proxiedNode.publish(MESSAGE)
        ])
    })

    it('happy path subscribing', async () => {
        await proxiedNode.setProxies(STREAM_PART_ID, [proxyNode1.getPeerDescriptor()], ProxyDirection.SUBSCRIBE, PROXIED_NODE_USER_ID, 1)
        proxiedNode.subscribe(STREAM_PART_ID)
        await Promise.all([
            waitForEvent3(proxiedNode.stack.getStreamrNode()! as any, 'newMessage'),
            proxyNode1.publish(MESSAGE)
        ])
    })

    it('can leave proxy publish connection', async () => {
        await proxiedNode.setProxies(STREAM_PART_ID, [proxyNode1.getPeerDescriptor()], ProxyDirection.PUBLISH, PROXIED_NODE_USER_ID, 1)
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(true) 
        expect(hasConnectionFromProxy(proxyNode1, proxiedNode.getNodeId(), ProxyDirection.PUBLISH)).toBe(true) 
        await proxiedNode.setProxies(STREAM_PART_ID, [], ProxyDirection.PUBLISH, PROXIED_NODE_USER_ID, 0)
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(false) 
        await waitForCondition(() => hasConnectionFromProxy(proxyNode1, proxiedNode.getNodeId(), ProxyDirection.PUBLISH) === false)
    })

    it('can leave proxy subscribe connection', async () => {
        await proxiedNode.setProxies(STREAM_PART_ID, [proxyNode1.getPeerDescriptor()], ProxyDirection.SUBSCRIBE, PROXIED_NODE_USER_ID, 1)
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(true) 
        expect(hasConnectionFromProxy(proxyNode1, proxiedNode.getNodeId(), ProxyDirection.SUBSCRIBE)).toBe(true) 
        await proxiedNode.setProxies(STREAM_PART_ID, [], ProxyDirection.SUBSCRIBE, PROXIED_NODE_USER_ID, 0)
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(false)
        await waitForCondition(() => hasConnectionFromProxy(proxyNode1, proxiedNode.getNodeId(), ProxyDirection.SUBSCRIBE) === false)
    })

    it('can open multiple proxy connections', async () => {
        await proxiedNode.setProxies(
            STREAM_PART_ID,
            [proxyNode1.getPeerDescriptor(), proxyNode2.getPeerDescriptor()],
            ProxyDirection.SUBSCRIBE,
            PROXIED_NODE_USER_ID
        )
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(true)
        expect(proxiedNode.stack.getStreamrNode().getStream(STREAM_PART_ID)!.layer2.getTargetNeighborIds().length).toBe(2)
        expect(hasConnectionFromProxy(proxyNode1, proxiedNode.getNodeId(), ProxyDirection.SUBSCRIBE)).toBe(true) 
        expect(hasConnectionFromProxy(proxyNode2, proxiedNode.getNodeId(), ProxyDirection.SUBSCRIBE)).toBe(true) 
    })

    it('can open multiple proxy connections and close one', async () => {
        await proxiedNode.setProxies(
            STREAM_PART_ID,
            [proxyNode1.getPeerDescriptor(), proxyNode2.getPeerDescriptor()],
            ProxyDirection.SUBSCRIBE,
            PROXIED_NODE_USER_ID
        )
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(true)
        expect(proxiedNode.stack.getStreamrNode().getStream(STREAM_PART_ID)!.layer2.getTargetNeighborIds().length).toBe(2)
        expect(hasConnectionFromProxy(proxyNode1, proxiedNode.getNodeId(), ProxyDirection.SUBSCRIBE)).toBe(true) 
        expect(hasConnectionFromProxy(proxyNode2, proxiedNode.getNodeId(), ProxyDirection.SUBSCRIBE)).toBe(true)
        await proxiedNode.setProxies(STREAM_PART_ID, [proxyNode1.getPeerDescriptor()], ProxyDirection.SUBSCRIBE, PROXIED_NODE_USER_ID)
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(true)
        expect(proxiedNode.stack.getStreamrNode().getStream(STREAM_PART_ID)!.layer2.getTargetNeighborIds().length).toBe(1)
        await waitForCondition(() => hasConnectionFromProxy(proxyNode2, proxiedNode.getNodeId(), ProxyDirection.SUBSCRIBE) === false)
        expect(hasConnectionFromProxy(proxyNode1, proxiedNode.getNodeId(), ProxyDirection.SUBSCRIBE)).toBe(true)
    })

    it('can open and close all connections', async () => {
        await proxiedNode.setProxies(
            STREAM_PART_ID,
            [proxyNode1.getPeerDescriptor(), proxyNode2.getPeerDescriptor()],
            ProxyDirection.SUBSCRIBE,
            PROXIED_NODE_USER_ID
        )
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(true)
        expect(proxiedNode.stack.getStreamrNode().getStream(STREAM_PART_ID)!.layer2.getTargetNeighborIds().length).toBe(2)
        expect(hasConnectionFromProxy(proxyNode1, proxiedNode.getNodeId(), ProxyDirection.SUBSCRIBE)).toBe(true) 
        expect(hasConnectionFromProxy(proxyNode2, proxiedNode.getNodeId(), ProxyDirection.SUBSCRIBE)).toBe(true)

        await proxiedNode.setProxies(STREAM_PART_ID, [], ProxyDirection.SUBSCRIBE, PROXIED_NODE_USER_ID)
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(false)
        await waitForCondition(() => hasConnectionFromProxy(proxyNode1, proxiedNode.getNodeId(), ProxyDirection.SUBSCRIBE) === false)
        await waitForCondition(() => hasConnectionFromProxy(proxyNode2, proxiedNode.getNodeId(), ProxyDirection.SUBSCRIBE) === false)
    })

    it('will reconnect if proxy node goes offline and comes back online', async () => {
        await proxiedNode.setProxies(
            STREAM_PART_ID,
            [proxyNode1.getPeerDescriptor()],
            ProxyDirection.SUBSCRIBE,
            PROXIED_NODE_USER_ID
        )
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(true)
        proxyNode1.unsubscribe(STREAM_PART_ID)
        await waitForCondition(() => hasConnectionToProxy(proxiedNode, proxyNode1.getNodeId(), ProxyDirection.SUBSCRIBE))
        expect(hasConnectionFromProxy(proxyNode1, proxiedNode.getNodeId(), ProxyDirection.SUBSCRIBE)).toBe(false)
        await proxyNode1.stack.getStreamrNode()!.joinStream(STREAM_PART_ID)
        await waitForCondition(() => hasConnectionToProxy(proxiedNode, proxyNode1.getNodeId(), ProxyDirection.SUBSCRIBE), 25000)
        expect(hasConnectionFromProxy(proxyNode1, proxiedNode.getNodeId(), ProxyDirection.SUBSCRIBE)).toBe(true)
    }, 30000)

    it('cannot subscribe on proxy publish streams', async () => {
        await proxiedNode.setProxies(
            STREAM_PART_ID,
            [proxyNode1.getPeerDescriptor()],
            ProxyDirection.PUBLISH,
            PROXIED_NODE_USER_ID
        )
        await expect(proxiedNode.subscribe(STREAM_PART_ID)).rejects.toThrow('Cannot subscribe')
    })

    it('connect publish on proxy subscribe streams', async () => {
        await proxiedNode.setProxies(
            STREAM_PART_ID,
            [proxyNode1.getPeerDescriptor()],
            ProxyDirection.SUBSCRIBE,
            PROXIED_NODE_USER_ID
        )
        await expect(proxiedNode.publish(MESSAGE)).rejects.toThrow('Cannot publish')
    })
})
