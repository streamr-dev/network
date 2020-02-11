import UnsubscribeRequestV1 from '../unsubscribe_request/UnsubscribeRequestV1'
import UnsupportedVersionError from '../../../errors/UnsupportedVersionError'
import ControlMessage from '../ControlMessage'
import UnsubscribeRequest from './UnsubscribeRequest'

const TYPE = 'unsubscribe'
const VERSION = 0

export default class UnsubscribeRequestV0 extends UnsubscribeRequest {
    constructor(streamId, streamPartition = 0) {
        super(VERSION, streamId, streamPartition)
    }

    toObject() {
        return {
            type: TYPE,
            stream: this.streamId,
            partition: this.streamPartition,
        }
    }

    toOtherVersion(version) {
        if (version === 1) {
            return new UnsubscribeRequestV1(this.streamId, this.streamPartition)
        }
        throw new UnsupportedVersionError(version, 'Supported versions: [0, 1]')
    }

    serialize(version = VERSION) {
        if (version === VERSION) {
            return JSON.stringify(this.toObject())
        }
        return this.toOtherVersion(version).serialize()
    }

    static getConstructorArgs(msg) {
        return [msg.stream, msg.partition]
    }
}

ControlMessage.registerClass(VERSION, TYPE, UnsubscribeRequestV0)
