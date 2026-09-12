import { areEqualPeerDescriptors, toNodeId } from '@streamr/dht'
import { StreamPartIDUtils, until } from '@streamr/utils'
import { ContentDeliveryManager } from '../../src/ContentDeliveryManager'
import { ContentDeliveryLayerNode } from '../../src/content-delivery-layer/ContentDeliveryLayerNode'
import { NeighborInfo } from '../../src/types'
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
        const message = createStreamMessage(
            JSON.stringify({ hello: 'WORLD' }),
            streamPartId,
            randomUserId()
        )

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

        it('re-emits neighbor statistics and neighbor list events with the stream part id', () => {
            manager.joinStreamPart(streamPartId)
            const delivery = manager.getStreamPartDelivery(streamPartId)!
            expect(delivery.proxied).toBe(false)
            const node = (delivery as { node: ContentDeliveryLayerNode }).node
            const onStatistics = jest.fn()
            const onList = jest.fn()
            manager.on('neighborStatisticsUpdated', onStatistics)
            manager.on('neighborListUpdated', onList)
            const neighborPeerDescriptor = createMockPeerDescriptor()
            const info: NeighborInfo = { nodeId: toNodeId(neighborPeerDescriptor), peerDescriptor: neighborPeerDescriptor }
            node.emit('neighborStatisticsUpdated', info)
            node.emit('neighborListUpdated', [info])
            expect(onStatistics).toHaveBeenCalledWith(streamPartId, info)
            expect(onList).toHaveBeenCalledWith(streamPartId, [info])
            expect(manager.getNeighborInfos(streamPartId)).toEqual([])
            expect(manager.getNeighborInfos(StreamPartIDUtils.parse('other#0'))).toEqual([])
        })
    })

    describe('proxied stream', () => {
        it('happy path', async () => {
            const streamPartId = StreamPartIDUtils.parse('stream#0')
            const proxy = createMockPeerDescriptor()
            const userId = randomUserId()
            await manager.setProxies(streamPartId, [proxy], userId)
            expect(manager.isProxiedStreamPart(streamPartId)).toBe(true)
            await manager.setProxies(streamPartId, [], userId)
            expect(manager.isProxiedStreamPart(streamPartId)).toBe(false)
        })

        it('empty node list', async () => {
            const streamPartId = StreamPartIDUtils.parse('stream#0')
            const proxy = createMockPeerDescriptor()
            const userId = randomUserId()
            await manager.setProxies(streamPartId, [], userId)
            expect(manager.isProxiedStreamPart(streamPartId)).toBe(false)
            await manager.setProxies(streamPartId, [proxy], userId)
            expect(manager.isProxiedStreamPart(streamPartId)).toBe(true)
            await manager.setProxies(streamPartId, [], userId)
            expect(manager.isProxiedStreamPart(streamPartId)).toBe(false)
        })

        it('connection count to 0', async () => {
            const streamPartId = StreamPartIDUtils.parse('stream#0')
            const proxy = createMockPeerDescriptor()
            const userId = randomUserId()
            await manager.setProxies(streamPartId, [proxy], userId, undefined, 0)
            expect(manager.isProxiedStreamPart(streamPartId)).toBe(false)
            await manager.setProxies(streamPartId, [proxy], userId)
            expect(manager.isProxiedStreamPart(streamPartId)).toBe(true)
            await manager.setProxies(streamPartId, [proxy], userId, undefined, 0)
            expect(manager.isProxiedStreamPart(streamPartId)).toBe(false)
        })
    })
})
