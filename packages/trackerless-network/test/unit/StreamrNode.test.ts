import { isSamePeerDescriptor } from '@streamr/dht'
import { StreamPartIDUtils } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { waitForCondition } from '@streamr/utils'
import { StreamrNode } from '../../src/logic/StreamrNode'
import { MockLayer0 } from '../utils/mock/MockLayer0'
import { MockTransport } from '../utils/mock/Transport'
import { createMockPeerDescriptor, createStreamMessage, mockConnectionLocker } from '../utils/utils'

describe('StreamrNode', () => {

    let node: StreamrNode
    const peerDescriptor = createMockPeerDescriptor()
    const streamPartId = StreamPartIDUtils.parse('stream#0')
    const message = createStreamMessage(
        JSON.stringify({ hello: 'WORLD' }), 
        streamPartId, 
        randomEthereumAddress()
    )

    beforeEach(async () => {
        node = new StreamrNode({})
        const mockLayer0 = new MockLayer0(peerDescriptor)
        await node.start(mockLayer0, new MockTransport(), mockConnectionLocker)
        node.setStreamPartEntryPoints(streamPartId, [peerDescriptor])
    })

    afterEach(async () => {
        await node.destroy()
    })

    it('PeerDescriptor is correct', () => {
        expect(isSamePeerDescriptor(peerDescriptor, node.getPeerDescriptor()))
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

    it('subscribe and wait for join', async () => {
        await node.waitForJoinAndSubscribe(streamPartId)
        expect(node.hasStream(streamPartId)).toEqual(true)
    })

    it('publish and wait for join', async () => {
        await node.waitForJoinAndPublish(streamPartId, message)
        expect(node.hasStream(streamPartId)).toEqual(true)
    })

    it('subscribe joins stream', async () => {
        node.subscribeToStream(streamPartId)
        await waitForCondition(() => node.hasStream(streamPartId))
    })

    it('publish joins stream', async () => {
        node.publishToStream(message)
        await waitForCondition(() => node.hasStream(streamPartId))
    })

    it('can unsubscribe', async () => {
        await node.joinStream(streamPartId)
        node.unsubscribeFromStream(streamPartId)
    })

})
