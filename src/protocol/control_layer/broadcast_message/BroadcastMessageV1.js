import UnsupportedVersionError from '../../../errors/UnsupportedVersionError'
import ControlMessage from '../ControlMessage'
import StreamMessageFactory from '../../message_layer/StreamMessageFactory'
import BroadcastMessage from './BroadcastMessage'
import BroadcastMessageV0 from './BroadcastMessageV0'

const VERSION = 1

export default class BroadcastMessageV1 extends BroadcastMessage {
    constructor(streamMessage) {
        super(VERSION)
        this.streamMessage = streamMessage
    }

    toArray(messageLayerVersion) {
        const array = super.toArray()
        array.push(JSON.parse(this.streamMessage.serialize(messageLayerVersion)))
        return array
    }

    toOtherVersion(version, messageLayerVersion) {
        if (version === 0) {
            let streamMsg = this.streamMessage
            if (messageLayerVersion && messageLayerVersion !== this.streamMessage.version) {
                streamMsg = this.streamMessage.toOtherVersion(messageLayerVersion)
            }
            return new BroadcastMessageV0(streamMsg)
        }
        throw new UnsupportedVersionError(version, 'Supported versions: [0, 1]')
    }

    static getConstructorArgs(array) {
        return [StreamMessageFactory.deserialize(array[0])]
    }
}

ControlMessage.registerClass(VERSION, BroadcastMessage.TYPE, BroadcastMessageV1)
