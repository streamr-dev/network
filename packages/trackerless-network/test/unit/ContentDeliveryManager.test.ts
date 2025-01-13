import { areEqualPeerDescriptors } from '@streamr/dht'
import { StreamPartIDUtils, until } from '@streamr/utils'
import { ContentDeliveryManager } from '../../src/logic/ContentDeliveryManager'
import { ProxyDirection } from '../../generated/packages/trackerless-network/protos/NetworkRpc'
import { MockControlLayerNode } from '../utils/mock/MockControlLayerNode'
import { MockTransport } from '../utils/mock/MockTransport'
import { createMockPeerDescriptor, createStreamMessage, mockConnectionLocker } from '../utils/utils'
import { randomUserId } from '@streamr/test-utils'

describe('ContentDeliveryManager', () => {
    let manager: ContentDeliveryManager
    const peerDescriptor = createMockPeerDescriptor()

    beforeEach(async () => {
        manager = new ContentDeliveryManager({})
        const mockLayer0 = new MockControlLayerNode(peerDescriptor)
        await manager.start(mockLayer0, new MockTransport(), mockConnectionLocker)
    })

    afterEach(async () => {
        await manager.destroy()
    })

    it('PeerDescriptor is correct', () => {
        // TODO could use toEqualPeerDescriptor from dht package if we export that custom matcher
        expect(areEqualPeerDescriptors(peerDescriptor, manager.getPeerDescriptor())).toBe(true)
    })

    describe('join and leave', () => {
        const streamPartId = StreamPartIDUtils.parse('stream#0')
        const message = createStreamMessage(JSON.stringify({ hello: 'WORLD' }), streamPartId, randomUserId())

        beforeEach(async () => {
            manager.setStreamPartEntryPoints(streamPartId, [manager.getPeerDescriptor()])
        })

        it('can join stream part', async () => {
            manager.joinStreamPart(streamPartId)
            expect(manager.hasStreamPart(streamPartId)).toEqual(true)
        })

        it('can leave stream part', async () => {
            manager.joinStreamPart(streamPartId)
            expect(manager.hasStreamPart(streamPartId)).toEqual(true)
            await manager.leaveStreamPart(streamPartId)
            expect(manager.hasStreamPart(streamPartId)).toEqual(false)
        })

        it('broadcast joins stream', async () => {
            manager.broadcast(message)
            await until(() => manager.hasStreamPart(streamPartId))
        })
    })

    describe('proxied stream', () => {
        it('happy path', async () => {
            const streamPartId = StreamPartIDUtils.parse('stream#0')
            const proxy = createMockPeerDescriptor()
            const userId = randomUserId()
            await manager.setProxies(streamPartId, [proxy], ProxyDirection.PUBLISH, userId)
            expect(manager.isProxiedStreamPart(streamPartId)).toBe(true)
            await manager.setProxies(streamPartId, [], ProxyDirection.PUBLISH, userId)
            expect(manager.isProxiedStreamPart(streamPartId)).toBe(false)
        })

        it('empty node list', async () => {
            const streamPartId = StreamPartIDUtils.parse('stream#0')
            const proxy = createMockPeerDescriptor()
            const userId = randomUserId()
            await manager.setProxies(streamPartId, [], ProxyDirection.PUBLISH, userId)
            expect(manager.isProxiedStreamPart(streamPartId)).toBe(false)
            await manager.setProxies(streamPartId, [proxy], ProxyDirection.PUBLISH, userId)
            expect(manager.isProxiedStreamPart(streamPartId)).toBe(true)
            await manager.setProxies(streamPartId, [], ProxyDirection.PUBLISH, userId)
            expect(manager.isProxiedStreamPart(streamPartId)).toBe(false)
        })

        it('connection count to 0', async () => {
            const streamPartId = StreamPartIDUtils.parse('stream#0')
            const proxy = createMockPeerDescriptor()
            const userId = randomUserId()
            await manager.setProxies(streamPartId, [proxy], ProxyDirection.PUBLISH, userId, 0)
            expect(manager.isProxiedStreamPart(streamPartId)).toBe(false)
            await manager.setProxies(streamPartId, [proxy], ProxyDirection.PUBLISH, userId)
            expect(manager.isProxiedStreamPart(streamPartId)).toBe(true)
            await manager.setProxies(streamPartId, [proxy], ProxyDirection.PUBLISH, userId, 0)
            expect(manager.isProxiedStreamPart(streamPartId)).toBe(false)
        })
    })
})
