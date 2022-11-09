import { NetworkStack } from '../../src/NetworkStack'
import { NodeType, PeerDescriptor, PeerID } from '@streamr/dht'
import {
    MessageID,
    MessageRef,
    StreamMessage,
    StreamPartIDUtils,
    toStreamID,
    StreamMessageType
} from '@streamr/protocol'
import { Event } from '../../src/logic/StreamrNode'
import { EthereumAddress, waitForCondition } from '@streamr/utils'

describe('NetworkStack', () => {

    let stack1: NetworkStack
    let stack2: NetworkStack

    const epDescriptor: PeerDescriptor = {
        peerId: PeerID.fromString('entrypoint').value,
        type: NodeType.NODEJS,
        websocket: { ip: 'localhost', port: 32222 }
    }

    beforeEach(async () => {
        stack1 = new NetworkStack({
            peerDescriptor: epDescriptor
        })
        stack2 = new NetworkStack({
            websocketPort: 32223,
            peerIdString: 'network-stack',
            entryPoints: [epDescriptor]
        })

        await stack1.startAll(epDescriptor)
        await stack2.startAll(epDescriptor)
    })

    afterEach(async () => {
        await Promise.all([
            stack1.getNetworkNode().destroy(),
            stack2.getNetworkNode().destroy()
        ])
    })

    it('Can use NetworkNode pub/sub via NetworkStack', async () => {
        let receivedMessages = 0
        const streamPartId = StreamPartIDUtils.parse('stream1#0')
        await stack1.getNetworkNode().subscribeAndWaitForJoin(streamPartId, epDescriptor)
        stack1.getNetworkNode().on(Event.NEW_MESSAGE, () => {
            receivedMessages += 1
        })

        const streamMessage = new StreamMessage({
            messageId: new MessageID(
                toStreamID('stream1'),
                0,
                666,
                0,
                'peer2' as EthereumAddress,
                'msgChainId'
            ),
            prevMsgRef: new MessageRef(665, 0),
            content: {
                hello: 'world'
            },
            messageType: StreamMessageType.MESSAGE,
            signature: 'signature',
        })
        await stack2.getNetworkNode().waitForJoinAndPublish(streamMessage, epDescriptor)
        await waitForCondition(() => receivedMessages === 1)
    })

})
