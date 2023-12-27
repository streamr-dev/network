import { areEqualPeerDescriptors } from '@streamr/dht'
import { StreamPartIDUtils } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { waitForCondition } from '@streamr/utils'
import { StreamrNode } from '../../src/logic/StreamrNode'
import { MockLayer0Node } from '../utils/mock/MockLayer0Node'
import { MockTransport } from '../utils/mock/Transport'
import { createMockPeerDescriptor, createStreamMessage, mockConnectionLocker } from '../utils/utils'
import { ProxyDirection } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'

describe('StreamrNode', () => {

    let node: StreamrNode
    const peerDescriptor = createMockPeerDescriptor()

    beforeEach(async () => {
        node = new StreamrNode({})
        const mockLayer0 = new MockLayer0Node(peerDescriptor)
        await node.start(mockLayer0, new MockTransport(), mockConnectionLocker)
    })

    afterEach(async () => {
        await node.destroy()
    })

    it('PeerDescriptor is correct', () => {
        expect(areEqualPeerDescriptors(peerDescriptor, node.getPeerDescriptor()))
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

        it('can join stream part', async () => {
            node.joinStreamPart(streamPartId)
            expect(node.hasStreamPart(streamPartId)).toEqual(true)
        })

        it('can leave stream part', async () => {
            node.joinStreamPart(streamPartId)
            expect(node.hasStreamPart(streamPartId)).toEqual(true)
            await node.leaveStreamPart(streamPartId)
            expect(node.hasStreamPart(streamPartId)).toEqual(false)
        })

        it('broadcast joins stream', async () => {
            node.broadcast(message)
            await waitForCondition(() => node.hasStreamPart(streamPartId))
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

    describe('getInfo', () => {

        const streamPartId = StreamPartIDUtils.parse('stream#0')

        it('getInfo returns queried streamPartition', async () => {
            node.joinStreamPart(streamPartId)
            await waitForCondition(() => node.getInfo([streamPartId]).streamPartitions.length === 1)
            const info = node.getInfo([streamPartId])
            expect(info.streamPartitions[0].id).toEqual(streamPartId)
        })
    
        it('getInfo does not return queried streamPart if it does not exist', async () => {
            const info = node.getInfo([streamPartId])
            expect(info.streamPartitions.length).toEqual(0)
        })
    
        it('getInfo without specified streamPartitions returns all streams', async () => {
            node.joinStreamPart(streamPartId)
            await waitForCondition(() => node.getInfo([streamPartId]).streamPartitions.length === 1)
            const info = node.getInfo()
            expect(info.streamPartitions.length).toEqual(1)
        })
    })

})
