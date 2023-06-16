import { ContentMessage } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { ContentMessageTranslator } from '../../src/logic/protocol-integration/stream-message/ContentMessageTranslator'

describe('ContentMessageTranslator', () => {
    
    const oldMessage = JSON.stringify({ hello: 'world' })
    const newMessage: ContentMessage = {
        body: JSON.stringify({ hello: 'world' })
    }

    it('translates old protocol to protobuf', () => {
        const translated = ContentMessageTranslator.toProtobuf(oldMessage)
        expect(translated).toEqual(newMessage)
    })

    it('translates protobuf to old protocol', () => {
        const translated = ContentMessageTranslator.toClientProtocol(newMessage)
        expect(translated).toEqual(oldMessage)
    })
})
