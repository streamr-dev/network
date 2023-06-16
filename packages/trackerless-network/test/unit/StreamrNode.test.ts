import { StreamrNode } from '../../src/logic/StreamrNode'
import { MockLayer0 } from '../utils/mock/MockLayer0'
import { isSamePeerDescriptor, PeerDescriptor, PeerID } from '@streamr/dht'
import { createStreamMessage, mockConnectionLocker } from '../utils/utils'
import { MockTransport } from '../utils/mock/Transport'
import { ContentMessage } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { waitForCondition } from '@streamr/utils'

describe('StreamrNode', () => {

    let node: StreamrNode
    const peerDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString('streamr-node').value,
        type: 0
    }
    const stream = 'stream'
    const content: ContentMessage = {
        body: JSON.stringify({ hello: "WORLD" })
    }
    const message = createStreamMessage(content, stream, 'publisher')

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

    it('can join streams', async () => {
        await node.joinStream(stream, [peerDescriptor])
        expect(node.hasStream(stream)).toEqual(true)
    })

    it('can leave streams', async () => {
        await node.joinStream(stream, [peerDescriptor])
        expect(node.hasStream(stream)).toEqual(true)
        node.leaveStream(stream)
        expect(node.hasStream(stream)).toEqual(false)
    })

    it('subscribe and wait for join', async () => {
        await node.waitForJoinAndSubscribe(stream, [peerDescriptor])
        expect(node.hasStream(stream)).toEqual(true)
    })

    it('publish and wait for join', async () => {
        await node.waitForJoinAndPublish(stream, [peerDescriptor], message)
        expect(node.hasStream(stream)).toEqual(true)
    })

    it('subscribe joins stream', async () => {
        node.subscribeToStream(stream, [peerDescriptor])
        await waitForCondition(() => node.hasStream(stream))
    })

    it('publish joins stream', async () => {
        await node.publishToStream(stream, [peerDescriptor], message)
        await waitForCondition(() => node.hasStream(stream))
    })

    it('can unsubscribe', async () => {
        await node.joinStream(stream, [peerDescriptor])
        await node.unsubscribeFromStream(stream)
    })

})
