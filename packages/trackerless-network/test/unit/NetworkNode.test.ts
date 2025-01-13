import { StreamPartIDUtils } from '@streamr/utils'
import { EventEmitter } from 'eventemitter3'
import { NetworkNode } from '../../src/NetworkNode'
import { NetworkStack } from '../../src/NetworkStack'
import { Events } from '../../src/logic/ContentDeliveryManager'
import { StreamMessage } from '../../generated/packages/trackerless-network/protos/NetworkRpc'
import { createStreamMessage } from '../utils/utils'
import { randomUserId } from '@streamr/test-utils'

const STREAM_PART = StreamPartIDUtils.parse('stream#0')
const PUBLISHER_ID = randomUserId()

const createMessage = (id: number): StreamMessage => {
    return createStreamMessage(`${id}`, STREAM_PART, PUBLISHER_ID)
}

describe('NetworkNode', () => {
    it('message listener', async () => {
        const contentDeliveryManager = new EventEmitter<Events>()
        const stack: Partial<NetworkStack> = {
            getContentDeliveryManager: () => contentDeliveryManager as any,
            joinStreamPart: async () => {}
        }
        const node = new NetworkNode(stack as any)
        await node.join(STREAM_PART)
        const onMessage = jest.fn()

        node.addMessageListener(onMessage)
        const msg1 = createMessage(1)
        const msg2 = createMessage(2)
        contentDeliveryManager.emit('newMessage', msg1)
        contentDeliveryManager.emit('newMessage', msg2)
        expect(onMessage.mock.calls[0][0]).toEqual(msg1)
        expect(onMessage.mock.calls[1][0]).toEqual(msg2)
        expect(onMessage).toHaveBeenCalledTimes(2)

        node.removeMessageListener(onMessage)
        contentDeliveryManager.emit('newMessage', createMessage(3))
        expect(onMessage).toHaveBeenCalledTimes(2)
    })
})
