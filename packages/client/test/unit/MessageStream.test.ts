import { toEthereumAddress } from '@streamr/utils'
import { MessageID, toStreamID } from '@streamr/protocol'
import { Authentication } from '../../src/Authentication'
import { createSignedMessage } from '../../src/publish/MessageFactory'
import { MessageStream } from '../../src/subscribe/MessageStream'
import { Msg } from '../test-utils/publish'
import { createRandomAuthentication, waitForCalls } from '../test-utils/utils'
import { convertStreamMessageToMessage } from './../../src/Message'
import { omit } from 'lodash'

const PUBLISHER_ID = toEthereumAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')

describe('MessageStream', () => {

    const streamId = toStreamID('streamId')
    let authentication: Authentication

    const createMockMessage = async () => {
        return await createSignedMessage({
            messageId: new MessageID(streamId, 0, 0, 0, PUBLISHER_ID, 'msgChainId'),
            serializedContent: JSON.stringify(Msg()),
            authentication
        })
    }

    beforeEach(async () => {
        authentication = createRandomAuthentication()
    })

    it('onMessage', async () => {
        const stream = new MessageStream<any>()
        const onMessage = jest.fn()
        stream.useLegacyOnMessageHandler(onMessage)
        const msg1 = await createMockMessage()
        const msg2 = await createMockMessage()
        stream.push(msg1)
        stream.push(msg2)
        await waitForCalls(onMessage, 2)
        // TODO could implement test so that it doesn't call convertStreamMessageToMessage?
        // (if we don't test the convertStreamMessageToMessage logic elsewhere)
        expect(onMessage).toHaveBeenNthCalledWith(1, msg1.getParsedContent(), omit(convertStreamMessageToMessage(msg1), 'content'))
        expect(onMessage).toHaveBeenNthCalledWith(2, msg2.getParsedContent(), omit(convertStreamMessageToMessage(msg2), 'content'))
    })
})
