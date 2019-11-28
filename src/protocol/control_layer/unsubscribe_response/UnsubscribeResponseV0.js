import StreamAndPartition from '../StreamAndPartition'
import ControlMessage from '../ControlMessage'
import UnsupportedVersionError from '../../../errors/UnsupportedVersionError'
import UnsubscribeResponse from './UnsubscribeResponse'
import UnsubscribeResponseV1 from './UnsubscribeResponseV1'

const VERSION = 0

export default class UnsubscribeResponseV0 extends UnsubscribeResponse {
    constructor(streamId, streamPartition) {
        super(VERSION)
        this.payload = new StreamAndPartition(streamId, streamPartition)
    }

    toArray() {
        const array = super.toArray()
        array.push(...[
            null, // requestId
            this.payload.toObject(),
        ])
        return array
    }

    toOtherVersion(version) {
        if (version === 1) {
            return new UnsubscribeResponseV1(this.payload.streamId, this.payload.streamPartition)
        }
        throw new UnsupportedVersionError(version, 'Supported versions: [0, 1]')
    }

    static getConstructorArgs(array) {
        const streamPartitionObject = array[1] // index 0 is the null requestId
        const payload = StreamAndPartition.deserialize(streamPartitionObject)
        return [payload.streamId, payload.streamPartition]
    }
}

ControlMessage.registerClass(VERSION, UnsubscribeResponse.TYPE, UnsubscribeResponseV0)
