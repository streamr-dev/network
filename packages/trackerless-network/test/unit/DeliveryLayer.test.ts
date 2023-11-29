import { areEqualPeerDescriptors } from '@streamr/dht'
import { StreamPartIDUtils } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { waitForCondition } from '@streamr/utils'
import { DeliveryLayer } from '../../src/logic/DeliveryLayer'
import { MockLayer0Node } from '../utils/mock/MockLayer0Node'
import { MockTransport } from '../utils/mock/Transport'
import { createMockPeerDescriptor, createStreamMessage, mockConnectionLocker } from '../utils/utils'
import { ProxyDirection } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'

describe('DeliveryLayer', () => {

    let layer: DeliveryLayer
    const peerDescriptor = createMockPeerDescriptor()

    beforeEach(async () => {
        layer = new DeliveryLayer({})
        const mockLayer0 = new MockLayer0Node(peerDescriptor)
        await layer.start(mockLayer0, new MockTransport(), mockConnectionLocker)
    })

    afterEach(async () => {
        await layer.destroy()
    })

    it('PeerDescriptor is correct', () => {
        expect(areEqualPeerDescriptors(peerDescriptor, layer.getPeerDescriptor()))
    })

    describe('join and leave', () => {

        const streamPartId = StreamPartIDUtils.parse('stream#0')
        const message = createStreamMessage(
            JSON.stringify({ hello: 'WORLD' }),
            streamPartId,
            randomEthereumAddress()
        )

        beforeEach(async () => {
            layer.setStreamPartEntryPoints(streamPartId, [layer.getPeerDescriptor()])
        })

        it('can join stream part', async () => {
            layer.joinStreamPart(streamPartId)
            expect(layer.hasStreamPart(streamPartId)).toEqual(true)
        })

        it('can leave stream part', async () => {
            layer.joinStreamPart(streamPartId)
            expect(layer.hasStreamPart(streamPartId)).toEqual(true)
            await layer.leaveStreamPart(streamPartId)
            expect(layer.hasStreamPart(streamPartId)).toEqual(false)
        })

        it('broadcast joins stream', async () => {
            layer.broadcast(message)
            await waitForCondition(() => layer.hasStreamPart(streamPartId))
        })
    })

    describe('proxied stream', () => {
        it('happy path', async () => {
            const streamPartId = StreamPartIDUtils.parse('stream#0')
            const proxy = createMockPeerDescriptor()
            const userId = randomEthereumAddress()
            await layer.setProxies(streamPartId, [proxy], ProxyDirection.PUBLISH, userId)
            expect(layer.isProxiedStreamPart(streamPartId)).toBe(true)
            await layer.setProxies(streamPartId, [], ProxyDirection.PUBLISH, userId)
            expect(layer.isProxiedStreamPart(streamPartId)).toBe(false)
        })

        it('empty node list', async () => {
            const streamPartId = StreamPartIDUtils.parse('stream#0')
            const proxy = createMockPeerDescriptor()
            const userId = randomEthereumAddress()
            await layer.setProxies(streamPartId, [], ProxyDirection.PUBLISH, userId)
            expect(layer.isProxiedStreamPart(streamPartId)).toBe(false)
            await layer.setProxies(streamPartId, [proxy], ProxyDirection.PUBLISH, userId)
            expect(layer.isProxiedStreamPart(streamPartId)).toBe(true)
            await layer.setProxies(streamPartId, [], ProxyDirection.PUBLISH, userId)
            expect(layer.isProxiedStreamPart(streamPartId)).toBe(false)
        })

        it('connection count to 0', async () => {
            const streamPartId = StreamPartIDUtils.parse('stream#0')
            const proxy = createMockPeerDescriptor()
            const userId = randomEthereumAddress()
            await layer.setProxies(streamPartId, [proxy], ProxyDirection.PUBLISH, userId, 0)
            expect(layer.isProxiedStreamPart(streamPartId)).toBe(false)
            await layer.setProxies(streamPartId, [proxy], ProxyDirection.PUBLISH, userId)
            expect(layer.isProxiedStreamPart(streamPartId)).toBe(true)
            await layer.setProxies(streamPartId, [proxy], ProxyDirection.PUBLISH, userId, 0)
            expect(layer.isProxiedStreamPart(streamPartId)).toBe(false)
        })
    })
})
