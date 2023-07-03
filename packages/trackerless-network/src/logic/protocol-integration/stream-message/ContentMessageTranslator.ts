import { ContentMessage } from '../../../proto/packages/trackerless-network/protos/NetworkRpc'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class ContentMessageTranslator {

    static toProtobuf(msg: string): ContentMessage {
        const translatedMessage: ContentMessage = {
            body: msg
        }
        return translatedMessage
    }

    static toClientProtocol(msg: ContentMessage): string {
        return msg.body
    }
}
