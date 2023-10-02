import { isSamePeerDescriptor } from '@streamr/dht'
import { StreamPartIDUtils } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { waitForCondition } from '@streamr/utils'
import { StreamrNode } from '../../src/logic/StreamrNode'
import { MockLayer0 } from '../utils/mock/MockLayer0'
import { MockTransport } from '../utils/mock/Transport'
import { createMockPeerDescriptor, createStreamMessage, mockConnectionLocker } from '../utils/utils'
import { ProxyDirection } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'

describe('StreamrNode', () => {

    let node: StreamrNode
    const peerDescriptor = createMockPeerDescriptor()

    beforeEach(async () => {
        node = new StreamrNode({})
        const mockLayer0 = new MockLayer0(peerDescriptor)
        await node.start(mockLayer0, new MockTransport(), mockConnectionLocker)
    })

    afterEach(async () => {
        await node.destroy()
    })

    it('PeerDescriptor is correct', () => {
        expect(isSamePeerDescriptor(peerDescriptor, node.getPeerDescriptor()))
    })

    describe('join and leave', () => {

        const streamPartId = StreamPartIDUtils.parse('stream#0')
        const message = createStreamMessage(
            JSON.stringify({ hello: 'WORLD' }), 
            streamPartId, 
            randomEthereumAddress()
        )

        beforeEach(async () => {
            node.setStreamPartEntryPoints(streamPartId, [node.getPeerDescriptor()])
        })
    
        it('can join streams', async () => {
            await node.joinStream(streamPartId)
            expect(node.hasStream(streamPartId)).toEqual(true)
        })
    
        it('can leave streams', async () => {
            await node.joinStream(streamPartId)
            expect(node.hasStream(streamPartId)).toEqual(true)
            node.leaveStream(streamPartId)
            expect(node.hasStream(streamPartId)).toEqual(false)
        })
    
        it('broadcast joins stream', async () => {
            node.broadcast(message)
            await waitForCondition(() => node.hasStream(streamPartId))
        })
    
        it('can leave', async () => {
            await node.joinStream(streamPartId)
            node.leaveStream(streamPartId)
        })
    })

    describe('proxied stream', () => {
        it('happy path', async () => {
            const streamPartId = StreamPartIDUtils.parse('stream#0')
            const proxy = createMockPeerDescriptor()
            const userId = randomEthereumAddress()
            await node.setProxies(streamPartId, [proxy], ProxyDirection.PUBLISH, userId)
            expect(node.isProxiedStreamPart(streamPartId)).toBe(true)
            await node.setProxies(streamPartId, [], ProxyDirection.PUBLISH, userId)
            expect(node.isProxiedStreamPart(streamPartId)).toBe(false)
        })

        it('empty node list', async () => {
            const streamPartId = StreamPartIDUtils.parse('stream#0')
            const proxy = createMockPeerDescriptor()
            const userId = randomEthereumAddress()
            await node.setProxies(streamPartId, [], ProxyDirection.PUBLISH, userId)
            expect(node.isProxiedStreamPart(streamPartId)).toBe(false)
            await node.setProxies(streamPartId, [proxy], ProxyDirection.PUBLISH, userId)
            expect(node.isProxiedStreamPart(streamPartId)).toBe(true)
            await node.setProxies(streamPartId, [], ProxyDirection.PUBLISH, userId)
            expect(node.isProxiedStreamPart(streamPartId)).toBe(false)
        })

        it('connection count to 0', async () => {
            const streamPartId = StreamPartIDUtils.parse('stream#0')
            const proxy = createMockPeerDescriptor()
            const userId = randomEthereumAddress()
            await node.setProxies(streamPartId, [proxy], ProxyDirection.PUBLISH, userId, 0)
            expect(node.isProxiedStreamPart(streamPartId)).toBe(false)
            await node.setProxies(streamPartId, [proxy], ProxyDirection.PUBLISH, userId)
            expect(node.isProxiedStreamPart(streamPartId)).toBe(true)
            await node.setProxies(streamPartId, [proxy], ProxyDirection.PUBLISH, userId, 0)
            expect(node.isProxiedStreamPart(streamPartId)).toBe(false)
        })
    })
})
