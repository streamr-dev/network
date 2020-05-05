import assert from 'assert'

import BroadcastMessage from '../../../../src/protocol/control_layer/broadcast_message/BroadcastMessage'
import BroadcastMessageV1 from '../../../../src/protocol/control_layer/broadcast_message/BroadcastMessageV1'
import StreamMessage from '../../../../src/protocol/message_layer/StreamMessage'
import StreamMessageFactory from '../../../../src/protocol/message_layer/StreamMessageFactory'

describe('BroadcastMessage', () => {
    describe('create', () => {
        it('should create the latest version', () => {
            const streamMessage = StreamMessageFactory.deserialize([30, ['TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0, 'address', 'msg-chain-id'],
                [1529549961000, 0], StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'signature'])
            const msg = BroadcastMessage.create(streamMessage)
            assert(msg instanceof BroadcastMessageV1)
            assert(msg.streamMessage instanceof StreamMessage)
        })
    })
})
