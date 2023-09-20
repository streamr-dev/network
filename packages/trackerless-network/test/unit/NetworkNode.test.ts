import { StreamPartIDUtils } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { EventEmitter } from 'eventemitter3'
import { NetworkNode } from '../../src/NetworkNode'
import { NetworkStack } from '../../src/NetworkStack'
import { Events } from '../../src/logic/StreamrNode'
import { StreamMessage } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { createStreamMessage } from '../utils/utils'
import { StreamMessageTranslator } from '../../src/logic/protocol-integration/stream-message/StreamMessageTranslator'

const STREAM_PART = StreamPartIDUtils.parse('stream#0')
const PUBLISHER_ID = randomEthereumAddress()

const createMessage = (id: number): StreamMessage => {
    return createStreamMessage(`${id}`, STREAM_PART, PUBLISHER_ID)
}

describe('NetworkNode', () => {

    it('message listener', async () => {
        const streamrNode = new class extends EventEmitter<Events> {
            // eslint-disable-next-line class-methods-use-this
            isProxiedStreamPart() { 
                return false
            }
            // eslint-disable-next-line class-methods-use-this
            safeJoinStream() {
            }
        }()
        const stack: Partial<NetworkStack> = {
            getStreamrNode: () => streamrNode as any,
            joinLayer0IfRequired: async () => {}
        }
        const node = new NetworkNode(stack as any)
        await node.subscribe(STREAM_PART)
        const onMessage = jest.fn()

        node.addMessageListener(onMessage)
        const msg1 = createMessage(1)
        const msg2 = createMessage(2)
        streamrNode.emit('newMessage', msg1)
        streamrNode.emit('newMessage', msg2)
        expect(onMessage.mock.calls[0][0]).toEqual(StreamMessageTranslator.toClientProtocol(msg1))
        expect(onMessage.mock.calls[1][0]).toEqual(StreamMessageTranslator.toClientProtocol(msg2))
        expect(onMessage).toBeCalledTimes(2)

        node.removeMessageListener(onMessage)
        streamrNode.emit('newMessage', createMessage(3))
        expect(onMessage).toBeCalledTimes(2)
    })
})
