import { validateIsNotNullOrUndefined } from '../../../utils/validations'
import UnsupportedVersionError from '../../../errors/UnsupportedVersionError'
import ControlMessage from '../ControlMessage'
import StreamMessageFactory from '../../message_layer/StreamMessageFactory'
import UnicastMessage from './UnicastMessage'
import UnicastMessageV0 from './UnicastMessageV0'

const VERSION = 1

export default class UnicastMessageV1 extends UnicastMessage {
    constructor(subId, streamMessage) {
        super(VERSION, subId)
        validateIsNotNullOrUndefined('streamMessage', streamMessage)
        this.streamMessage = streamMessage
    }

    toArray(messageLayerVersion) {
        const array = super.toArray()
        array.push(...[
            JSON.parse(this.streamMessage.serialize(messageLayerVersion)),
        ])
        return array
    }

    toOtherVersion(version, messageLayerVersion) {
        if (version === 0) {
            let streamMsg = this.streamMessage
            if (messageLayerVersion && messageLayerVersion !== this.streamMessage.version) {
                streamMsg = this.streamMessage.toOtherVersion(messageLayerVersion)
            }
            return new UnicastMessageV0(streamMsg, this.subId)
        }
        throw new UnsupportedVersionError(version, 'Supported versions: [0, 1]')
    }

    static getConstructorArgs(array) {
        const subId = array[0]
        const streamMessageArray = array[1]
        const streamMessage = StreamMessageFactory.deserialize(streamMessageArray)
        return [subId, streamMessage]
    }
}

ControlMessage.registerClass(VERSION, UnicastMessage.TYPE, UnicastMessageV1)
