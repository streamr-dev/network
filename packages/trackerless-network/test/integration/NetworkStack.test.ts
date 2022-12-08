import { NetworkStack } from '../../src/NetworkStack'
import { NodeType, PeerDescriptor, PeerID } from '@streamr/dht'
import {
    StreamPartIDUtils,
    toStreamID,
} from '@streamr/protocol'
import { Event } from '../../src/logic/StreamrNode'
import { waitForCondition } from '@streamr/utils'
import { ContentMessage } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { createStreamMessage } from '../utils'

describe('NetworkStack', () => {

    let stack1: NetworkStack
    let stack2: NetworkStack

    const epDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString('entrypoint').value,
        type: NodeType.NODEJS,
        websocket: { ip: 'localhost', port: 32222 }
    }

    beforeEach(async () => {
        stack1 = new NetworkStack({
            layer0: {
                peerDescriptor: epDescriptor,
                entryPoints: [epDescriptor]
            },
            networkNode: {}
        })
        stack2 = new NetworkStack({
            layer0: {
                webSocketPort: 32223,
                peerIdString: 'network-stack',
                entryPoints: [epDescriptor]
            },
            networkNode: {}
        })

        await stack1.start()
        await stack2.start()
    })

    afterEach(async () => {
        await Promise.all([
            stack1.stop(),
            stack2.stop()
        ])
    })

    it('Can use NetworkNode pub/sub via NetworkStack', async () => {
        let receivedMessages = 0
        const streamPartId = StreamPartIDUtils.parse('stream1#0')
        await stack1.getStreamrNode().subscribeAndWaitForJoin(streamPartId, epDescriptor)
        stack1.getStreamrNode().on(Event.NEW_MESSAGE, () => {
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

        await stack2.getStreamrNode().waitForJoinAndPublish(streamPartId, epDescriptor, msg)
        await waitForCondition(() => receivedMessages === 1)
    })

})
