import { MessageID, MessageRef, StreamMessage, StreamMessageType, StreamPartIDUtils } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { hexToBinary, utf8ToBinary, wait, waitForCondition, waitForEvent3 } from '@streamr/utils'
import { NetworkNode, createNetworkNode } from '../../src/NetworkNode'
import { NodeID } from '../../src/identifiers'
import { RandomGraphNode } from '../../src/logic/RandomGraphNode'
import { ProxyClient } from '../../src/logic/proxy/ProxyClient'
import { ProxyDirection } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { createMockPeerDescriptor } from '../utils/utils'

const PROXIED_NODE_USER_ID = randomEthereumAddress()
const STREAM_PART_ID = StreamPartIDUtils.parse('proxy-test#0')
const MESSAGE = new StreamMessage({
    messageId: new MessageID(
        StreamPartIDUtils.getStreamID(STREAM_PART_ID),
        StreamPartIDUtils.getStreamPartition(STREAM_PART_ID),
        666,
        0,
        randomEthereumAddress(),
        'msgChainId'
    ),
    prevMsgRef: new MessageRef(665, 0),
    content: utf8ToBinary(JSON.stringify({
        hello: 'world'
    })),
    messageType: StreamMessageType.MESSAGE,
    signature: hexToBinary('0x1234')
})

describe('Proxy connections', () => {

    let proxyNode1: NetworkNode
    let proxyNode2: NetworkNode
    let proxiedNode: NetworkNode

    const hasConnectionFromProxy = (proxyNode: NetworkNode): boolean => {
        const delivery = proxyNode.stack.getStreamrNode()!.getStreamPartDelivery(STREAM_PART_ID)
        return (delivery !== undefined)
            ? ((delivery as { node: RandomGraphNode }).node).hasProxyConnection(proxiedNode.getNodeId())
            : false
    }
    
    const hasConnectionToProxy = (proxyNodeId: NodeID, direction: ProxyDirection): boolean => {
        const client = (proxiedNode.stack.getStreamrNode()!.getStreamPartDelivery(STREAM_PART_ID) as { client: ProxyClient }).client
        return client.hasConnection(proxyNodeId, direction)
    }

    beforeEach(async () => {
        const proxyNodeDescriptor1 = createMockPeerDescriptor({
            nodeName: 'proxyNode',
            websocket: { host: '127.0.0.1', port: 23132, tls: false }
        })
        const proxyNodeDescriptor2 = createMockPeerDescriptor({
            nodeName: 'proxyNode',
            websocket: { host: '127.0.0.1', port: 23133, tls: false }
        })
        const proxiedNodeDescriptor = createMockPeerDescriptor()
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
        proxyNode1.stack.getStreamrNode()!.joinStreamPart(STREAM_PART_ID)
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
        proxyNode2.stack.getStreamrNode()!.joinStreamPart(STREAM_PART_ID)
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
            proxiedNode.broadcast(MESSAGE)
        ])
    })

    it('happy path subscribing', async () => {
        await proxiedNode.setProxies(STREAM_PART_ID, [proxyNode1.getPeerDescriptor()], ProxyDirection.SUBSCRIBE, PROXIED_NODE_USER_ID, 1)
        await Promise.all([
            waitForEvent3(proxiedNode.stack.getStreamrNode()! as any, 'newMessage'),
            proxyNode1.broadcast(MESSAGE)
        ])
    })

    it('can leave proxy publish connection', async () => {
        await proxiedNode.setProxies(STREAM_PART_ID, [proxyNode1.getPeerDescriptor()], ProxyDirection.PUBLISH, PROXIED_NODE_USER_ID, 1)
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(true) 
        expect(hasConnectionFromProxy(proxyNode1)).toBe(true) 
        await proxiedNode.setProxies(STREAM_PART_ID, [], ProxyDirection.PUBLISH, PROXIED_NODE_USER_ID, 0)
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(false) 
        await waitForCondition(() => hasConnectionFromProxy(proxyNode1) === false)
    })

    it('can leave proxy subscribe connection', async () => {
        await proxiedNode.setProxies(STREAM_PART_ID, [proxyNode1.getPeerDescriptor()], ProxyDirection.SUBSCRIBE, PROXIED_NODE_USER_ID, 1)
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(true) 
        expect(hasConnectionFromProxy(proxyNode1)).toBe(true) 
        await proxiedNode.setProxies(STREAM_PART_ID, [], ProxyDirection.SUBSCRIBE, PROXIED_NODE_USER_ID, 0)
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(false)
        await waitForCondition(() => hasConnectionFromProxy(proxyNode1) === false)
    })

    it('can open multiple proxy connections', async () => {
        await proxiedNode.setProxies(
            STREAM_PART_ID,
            [proxyNode1.getPeerDescriptor(), proxyNode2.getPeerDescriptor()],
            ProxyDirection.SUBSCRIBE,
            PROXIED_NODE_USER_ID
        )
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(true)
        expect(hasConnectionFromProxy(proxyNode1)).toBe(true) 
        expect(hasConnectionFromProxy(proxyNode2)).toBe(true) 
    })

    it('can open multiple proxy connections and close one', async () => {
        await proxiedNode.setProxies(
            STREAM_PART_ID,
            [proxyNode1.getPeerDescriptor(), proxyNode2.getPeerDescriptor()],
            ProxyDirection.SUBSCRIBE,
            PROXIED_NODE_USER_ID
        )
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(true)
        expect(hasConnectionFromProxy(proxyNode1)).toBe(true) 
        expect(hasConnectionFromProxy(proxyNode2)).toBe(true)
        await proxiedNode.setProxies(STREAM_PART_ID, [proxyNode1.getPeerDescriptor()], ProxyDirection.SUBSCRIBE, PROXIED_NODE_USER_ID)
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(true)
        await waitForCondition(() => hasConnectionFromProxy(proxyNode2) === false)
        expect(hasConnectionFromProxy(proxyNode1)).toBe(true)
    })

    it('can open and close all connections', async () => {
        await proxiedNode.setProxies(
            STREAM_PART_ID,
            [proxyNode1.getPeerDescriptor(), proxyNode2.getPeerDescriptor()],
            ProxyDirection.SUBSCRIBE,
            PROXIED_NODE_USER_ID
        )
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(true)
        expect(hasConnectionFromProxy(proxyNode1)).toBe(true) 
        expect(hasConnectionFromProxy(proxyNode2)).toBe(true)

        await proxiedNode.setProxies(STREAM_PART_ID, [], ProxyDirection.SUBSCRIBE, PROXIED_NODE_USER_ID)
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(false)
        await waitForCondition(() => hasConnectionFromProxy(proxyNode1) === false)
        await waitForCondition(() => hasConnectionFromProxy(proxyNode2) === false)
    })

    it('will reconnect if proxy node goes offline and comes back online', async () => {
        await proxiedNode.setProxies(
            STREAM_PART_ID,
            [proxyNode1.getPeerDescriptor()],
            ProxyDirection.SUBSCRIBE,
            PROXIED_NODE_USER_ID
        )
        expect(proxiedNode.hasStreamPart(STREAM_PART_ID)).toBe(true)
        proxyNode1.leave(STREAM_PART_ID)
        await waitForCondition(() => hasConnectionToProxy(proxyNode1.getNodeId(), ProxyDirection.SUBSCRIBE))
        expect(hasConnectionFromProxy(proxyNode1)).toBe(false)
        proxyNode1.stack.getStreamrNode()!.joinStreamPart(STREAM_PART_ID)
        await waitForCondition(() => hasConnectionToProxy(proxyNode1.getNodeId(), ProxyDirection.SUBSCRIBE), 25000)
        // TODO why wait is needed?
        await wait(100)
        expect(hasConnectionFromProxy(proxyNode1)).toBe(true)
    }, 30000)

    it('can\'t join proxied stream part', async () => {
        await proxiedNode.setProxies(
            STREAM_PART_ID,
            [proxyNode1.getPeerDescriptor()],
            ProxyDirection.PUBLISH,
            PROXIED_NODE_USER_ID
        )
        await expect(proxiedNode.join(STREAM_PART_ID)).rejects.toThrow('Cannot join')
    })

    it('can\'t broadcast to proxied stream part', async () => {
        await proxiedNode.setProxies(
            STREAM_PART_ID,
            [proxyNode1.getPeerDescriptor()],
            ProxyDirection.SUBSCRIBE,
            PROXIED_NODE_USER_ID
        )
        await expect(proxiedNode.broadcast(MESSAGE)).rejects.toThrow('Cannot broadcast')
    })
})
