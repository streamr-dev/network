import UnsupportedVersionError from '../../../errors/UnsupportedVersionError'
import ControlMessage from '../ControlMessage'

import SubscribeRequest from './SubscribeRequest'
import SubscribeRequestV0 from './SubscribeRequestV0'

const VERSION = 1

export default class SubscribeRequestV1 extends SubscribeRequest {
    constructor(streamId, streamPartition = 0, sessionToken) {
        super(VERSION, streamId, streamPartition, sessionToken)
    }

    toArray() {
        const array = super.toArray()
        array.push(...[
            this.streamId,
            this.streamPartition,
            this.sessionToken,
        ])
        return array
    }

    toOtherVersion(version) {
        if (version === 0) {
            return new SubscribeRequestV0(this.streamId, this.streamPartition, undefined, this.sessionToken)
        }
        throw new UnsupportedVersionError(version, 'Supported versions: [0, 1]')
    }
}

ControlMessage.registerClass(VERSION, SubscribeRequest.TYPE, SubscribeRequestV1)
