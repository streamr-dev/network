import { validateIsString } from '../../../utils/validations'
import UnsupportedVersionError from '../../../errors/UnsupportedVersionError'
import ControlMessage from '../ControlMessage'
import SubscribeRequest from './SubscribeRequest'
import SubscribeRequestV1 from './SubscribeRequestV1'

const TYPE = 'subscribe'
const VERSION = 0

export default class SubscribeRequestV0 extends SubscribeRequest {
    constructor(streamId, streamPartition = 0, apiKey, sessionToken) {
        super(VERSION, streamId, streamPartition, sessionToken)
        validateIsString('apiKey', apiKey, true)
        this.apiKey = apiKey
    }

    toObject() {
        return {
            type: TYPE,
            stream: this.streamId,
            partition: this.streamPartition,
            authKey: this.apiKey,
            sessionToken: this.sessionToken,
        }
    }

    toOtherVersion(version) {
        if (version === 1) {
            return new SubscribeRequestV1(this.streamId, this.streamPartition, this.sessionToken)
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
        return [msg.stream, msg.partition, msg.authKey, msg.sessionToken]
    }
}

ControlMessage.registerClass(VERSION, TYPE, SubscribeRequestV0)
