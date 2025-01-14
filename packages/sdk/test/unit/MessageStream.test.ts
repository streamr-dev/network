import 'reflect-metadata'

import { toStreamID, utf8ToBinary } from '@streamr/utils'
import omit from 'lodash/omit'
import { MessageSigner } from '../../src/signature/MessageSigner'
import { MessageStream } from '../../src/subscribe/MessageStream'
import { Msg } from '../test-utils/publish'
import { createRandomAuthentication, waitForCalls } from '../test-utils/utils'
import { convertStreamMessageToMessage } from './../../src/Message'
import { MessageID } from './../../src/protocol/MessageID'
import { ContentType, EncryptionType, SignatureType, StreamMessageType } from './../../src/protocol/StreamMessage'
import { randomUserId } from '@streamr/test-utils'

const PUBLISHER_ID = randomUserId()

describe('MessageStream', () => {
    const streamId = toStreamID('streamId')
    let messageSigner: MessageSigner

    const createMockMessage = async () => {
        return await messageSigner.createSignedMessage(
            {
                messageId: new MessageID(streamId, 0, 0, 0, PUBLISHER_ID, 'msgChainId'),
                messageType: StreamMessageType.MESSAGE,
                content: utf8ToBinary(JSON.stringify(Msg())),
                contentType: ContentType.JSON,
                encryptionType: EncryptionType.NONE
            },
            SignatureType.SECP256K1
        )
    }

    beforeEach(async () => {
        messageSigner = new MessageSigner(createRandomAuthentication())
    })

    it('onMessage', async () => {
        const stream = new MessageStream()
        const onMessage = jest.fn()
        stream.useLegacyOnMessageHandler(onMessage)
        const msg1 = await createMockMessage()
        const msg2 = await createMockMessage()
        stream.push(msg1)
        stream.push(msg2)
        await waitForCalls(onMessage, 2)
        // TODO could implement test so that it doesn't call convertStreamMessageToMessage?
        // (if we don't test the convertStreamMessageToMessage logic elsewhere)
        expect(onMessage).toHaveBeenNthCalledWith(
            1,
            msg1.getParsedContent(),
            omit(convertStreamMessageToMessage(msg1), 'content')
        )
        expect(onMessage).toHaveBeenNthCalledWith(
            2,
            msg2.getParsedContent(),
            omit(convertStreamMessageToMessage(msg2), 'content')
        )
    })
})
