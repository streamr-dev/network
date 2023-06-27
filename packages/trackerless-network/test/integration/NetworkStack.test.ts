import { NetworkStack } from '../../src/NetworkStack'
import { NodeType, PeerDescriptor, PeerID } from '@streamr/dht'
import {
    StreamPartIDUtils,
    toStreamID,
} from '@streamr/protocol'
import { waitForCondition } from '@streamr/utils'
import { ContentMessage } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { createStreamMessage } from '../utils/utils'

describe('NetworkStack', () => {

    let stack1: NetworkStack
    let stack2: NetworkStack
    const streamPartId = StreamPartIDUtils.parse('stream1#0')

    const epDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString('entrypoint').value,
        type: NodeType.NODEJS,
        websocket: { ip: 'localhost', port: 32222 },
        nodeName: 'entrypoint'
    }

    beforeEach(async () => {
        stack1 = new NetworkStack({
            layer0: {
                peerDescriptor: epDescriptor,
                entryPoints: [epDescriptor],
                nodeName: 'entrypoint'
            },
            networkNode: {}
        })
        stack2 = new NetworkStack({
            layer0: {
                webSocketPort: 32223,
                peerIdString: 'network-stack',
                entryPoints: [epDescriptor],
                nodeName: 'node2'
            },
            networkNode: {}
        })

        await stack1.start()
        stack1.getStreamrNode()!.setStreamEntryPoints(streamPartId, [epDescriptor])
        await stack2.start()
        stack2.getStreamrNode()!.setStreamEntryPoints(streamPartId, [epDescriptor])
    })

    afterEach(async () => {
        await Promise.all([
            stack1.stop(),
            stack2.stop()
        ])
    })

    it('Can use NetworkNode pub/sub via NetworkStack', async () => {
        let receivedMessages = 0
        await stack1.getStreamrNode().waitForJoinAndSubscribe(streamPartId)
        stack1.getStreamrNode().on('newMessage', () => {
            receivedMessages += 1
        })
        const content: ContentMessage = {
            body: JSON.stringify({ hello: "WORLD" })
        }
        const msg = createStreamMessage(
            content,
            toStreamID(streamPartId),
            PeerID.fromString('network-stack').toKey()
        )
        await stack2.getStreamrNode().waitForJoinAndPublish(streamPartId, msg)
        await waitForCondition(() => receivedMessages === 1)
    })

})
