import StreamMessageFactory from '../../message_layer/StreamMessageFactory'
import ControlMessage from '../ControlMessage'
import PublishRequest from './PublishRequest'

const VERSION = 1

export default class PublishRequestV1 extends PublishRequest {
    constructor(streamMessage, sessionToken) {
        super(VERSION, sessionToken)
        this.streamMessage = streamMessage
    }

    getStreamMessage() {
        return this.streamMessage
    }

    toArray(messageLayerVersion) {
        const array = super.toArray()
        array.push(...[
            JSON.parse(this.streamMessage.serialize(messageLayerVersion)),
            this.sessionToken,
        ])
        return array
    }

    serialize(messageLayerVersion) {
        return JSON.stringify(this.toArray(messageLayerVersion))
    }

    static getConstructorArgs(array) {
        const streamMessage = StreamMessageFactory.deserialize(array[0])
        return [streamMessage, array[1]]
    }
}

ControlMessage.registerClass(VERSION, PublishRequest.TYPE, PublishRequestV1)
