import { NodeType, PeerDescriptor, PeerID, peerIdFromPeerDescriptor } from "@streamr/dht"
import { NetworkStack } from "../../src/NetworkStack"
import { ContentMessage, ProxyDirection } from "../../src/proto/packages/trackerless-network/protos/NetworkRpc"
import { createStreamMessage } from "../utils/utils"
import { waitForCondition, waitForEvent3 } from "@streamr/utils"

describe('Proxy connections', () => {

    const proxyNodeDescriptor1: PeerDescriptor = {
        kademliaId: PeerID.fromString(`proxyNode1`).value,
        type: NodeType.NODEJS,
        nodeName: 'proxyNode',
        websocket: { ip: 'localhost', port: 23132 }
    }
    const proxyNodeDescriptor2: PeerDescriptor = {
        kademliaId: PeerID.fromString(`proxyNode2`).value,
        type: NodeType.NODEJS,
        nodeName: 'proxyNode',
        websocket: { ip: 'localhost', port: 23133 }
    }
    const proxiedNodeDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString(`proxiedNode`).value,
        type: NodeType.NODEJS,
    }
    const proxiedPeerId = peerIdFromPeerDescriptor(proxiedNodeDescriptor)

    const streamPartId = 'proxy-test#0'
    const content: ContentMessage = {
        body: JSON.stringify({ hello: 'world' }),
    }
    const message = createStreamMessage(
        content,
        streamPartId,
        'proxiedNode'
    )

    let proxyNode1: NetworkStack
    let proxyNode2: NetworkStack
    let proxiedNode: NetworkStack

    beforeEach(async () => {
        proxyNode1 = new NetworkStack({
            layer0: {
                entryPoints: [proxyNodeDescriptor1],
                peerDescriptor: proxyNodeDescriptor1,
            },
            networkNode: {
                acceptProxyConnections: true
            }
        })
        await proxyNode1.start()
        await proxyNode1.getStreamrNode()!.joinStream(streamPartId, [proxyNodeDescriptor1])
       
        proxyNode2 = new NetworkStack({
            layer0: {
                entryPoints: [proxyNodeDescriptor1],
                peerDescriptor: proxyNodeDescriptor2,
            },
            networkNode: {
                acceptProxyConnections: true
            }
        })
        await proxyNode2.start()
        await proxyNode2.getStreamrNode()!.joinStream(streamPartId, [proxyNodeDescriptor1])

        proxiedNode = new NetworkStack({
            layer0: {
                entryPoints: [proxyNodeDescriptor1],
                peerDescriptor: proxiedNodeDescriptor,
            },
            networkNode: {}
        })
        await proxiedNode.start()
    })

    afterEach(async () => {
        await proxyNode1.stop()
        await proxyNode2.stop()
        await proxiedNode.stop()
    })

    it('happy path publishing', async () => {
        await proxiedNode.getStreamrNode()!.setProxies(streamPartId, [proxyNodeDescriptor1], ProxyDirection.PUBLISH, async () => 'proxiedNode', 1)

        await Promise.all([
            waitForEvent3(proxyNode1.getStreamrNode()! as any, 'newMessage'),
            proxiedNode.getStreamrNode()!.publishToStream(streamPartId, [], message)
        ])
    })

    it('happy path subscribing', async () => {
        await proxiedNode.getStreamrNode()!.setProxies(streamPartId, [proxyNodeDescriptor1], ProxyDirection.SUBSCRIBE, async () => 'proxiedNode', 1)
        proxiedNode.getStreamrNode()!.subscribeToStream(streamPartId, [])
        await Promise.all([
            waitForEvent3(proxiedNode.getStreamrNode()! as any, 'newMessage'),
            proxyNode1.getStreamrNode()!.publishToStream(streamPartId, [], message)
        ])
    })

    it('can leave proxy publish connection', async () => {
        await proxiedNode.getStreamrNode()!.setProxies(streamPartId, [proxyNodeDescriptor1], ProxyDirection.PUBLISH, async () => 'proxiedNode', 1)
        expect(proxiedNode.getStreamrNode().hasStream(streamPartId)).toBe(true) 
        expect(proxyNode1.getStreamrNode().hasProxyConnection(streamPartId, proxiedPeerId.toKey())).toBe(true) 

        await proxiedNode.getStreamrNode()!.setProxies(streamPartId, [], ProxyDirection.PUBLISH, async () => 'proxiedNode', 0)
        expect(proxiedNode.getStreamrNode().hasStream(streamPartId)).toBe(false) 
        await waitForCondition(() => proxyNode1.getStreamrNode().hasProxyConnection(streamPartId, proxiedPeerId.toKey()) === false)
    })

    it('can leave proxy subscribe connection', async () => {
        await proxiedNode.getStreamrNode()!.setProxies(streamPartId, [proxyNodeDescriptor1], ProxyDirection.SUBSCRIBE, async () => 'proxiedNode', 1)
        expect(proxiedNode.getStreamrNode().hasStream(streamPartId)).toBe(true) 
        expect(proxyNode1.getStreamrNode().hasProxyConnection(streamPartId, proxiedPeerId.toKey())).toBe(true) 

        await proxiedNode.getStreamrNode()!.setProxies(streamPartId, [], ProxyDirection.SUBSCRIBE, async () => 'proxiedNode', 0)
        expect(proxiedNode.getStreamrNode().hasStream(streamPartId)).toBe(false)
        await waitForCondition(() => proxyNode1.getStreamrNode().hasProxyConnection(streamPartId, proxiedPeerId.toKey()) === false)

    })

    it('can open multiple proxy connections', async () => {
        await proxiedNode.getStreamrNode()!.setProxies(
            streamPartId,
            [proxyNodeDescriptor1, proxyNodeDescriptor2],
            ProxyDirection.SUBSCRIBE,
            async () => 'proxiedNode'
        )
        expect(proxiedNode.getStreamrNode().hasStream(streamPartId)).toBe(true)
        expect(proxiedNode.getStreamrNode().getStream(streamPartId)!.layer2.getTargetNeighborStringIds().length).toBe(2)
        expect(proxyNode1.getStreamrNode().hasProxyConnection(streamPartId, proxiedPeerId.toKey())).toBe(true) 
        expect(proxyNode2.getStreamrNode().hasProxyConnection(streamPartId, proxiedPeerId.toKey())).toBe(true) 
    })

    it('can open multiple proxy connections and close one', async () => {
        await proxiedNode.getStreamrNode()!.setProxies(
            streamPartId,
            [proxyNodeDescriptor1, proxyNodeDescriptor2],
            ProxyDirection.SUBSCRIBE,
            async () => 'proxiedNode'
        )
        expect(proxiedNode.getStreamrNode().hasStream(streamPartId)).toBe(true)
        expect(proxiedNode.getStreamrNode().getStream(streamPartId)!.layer2.getTargetNeighborStringIds().length).toBe(2)
        expect(proxyNode1.getStreamrNode().hasProxyConnection(streamPartId, proxiedPeerId.toKey())).toBe(true) 
        expect(proxyNode2.getStreamrNode().hasProxyConnection(streamPartId, proxiedPeerId.toKey())).toBe(true)
        
        await proxiedNode.getStreamrNode()!.setProxies(streamPartId, [proxyNodeDescriptor1], ProxyDirection.SUBSCRIBE, async () => 'proxiedNode')
        expect(proxiedNode.getStreamrNode().hasStream(streamPartId)).toBe(true)
        expect(proxiedNode.getStreamrNode().getStream(streamPartId)!.layer2.getTargetNeighborStringIds().length).toBe(1)
        await waitForCondition(() => proxyNode2.getStreamrNode().hasProxyConnection(streamPartId, proxiedPeerId.toKey()) === false)
        expect(proxyNode1.getStreamrNode().hasProxyConnection(streamPartId, proxiedPeerId.toKey())).toBe(true)
    })

    it('can open and close all connections', async () => {
        await proxiedNode.getStreamrNode()!.setProxies(
            streamPartId,
            [proxyNodeDescriptor1, proxyNodeDescriptor2],
            ProxyDirection.SUBSCRIBE,
            async () => 'proxiedNode'
        )
        expect(proxiedNode.getStreamrNode().hasStream(streamPartId)).toBe(true)
        expect(proxiedNode.getStreamrNode().getStream(streamPartId)!.layer2.getTargetNeighborStringIds().length).toBe(2)
        expect(proxyNode1.getStreamrNode().hasProxyConnection(streamPartId, proxiedPeerId.toKey())).toBe(true) 
        expect(proxyNode2.getStreamrNode().hasProxyConnection(streamPartId, proxiedPeerId.toKey())).toBe(true)

        await proxiedNode.getStreamrNode()!.setProxies(streamPartId, [], ProxyDirection.SUBSCRIBE, async () => 'proxiedNode')
        expect(proxiedNode.getStreamrNode().hasStream(streamPartId)).toBe(false)
        await waitForCondition(() => proxyNode1.getStreamrNode().hasProxyConnection(streamPartId, proxiedPeerId.toKey()) === false)
        await waitForCondition(() => proxyNode2.getStreamrNode().hasProxyConnection(streamPartId, proxiedPeerId.toKey()) === false)
    })

})
