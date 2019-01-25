import ResendResponsePayload from '../ResendResponsePayload'
import UnsupportedVersionError from '../../../errors/UnsupportedVersionError'
import ControlMessage from '../ControlMessage'
import ResendResponseResent from './ResendResponseResent'
import ResendResponseResentV1 from './ResendResponseResentV1'

const VERSION = 0

export default class ResendResponseResentV0 extends ResendResponseResent {
    constructor(streamId, streamPartition, subId) {
        super(VERSION)
        this.payload = new ResendResponsePayload(streamId, streamPartition, subId)
    }

    toArray() {
        const array = super.toArray()
        array.push(...[
            null, // subId
            this.payload.toObject(),
        ])
        return array
    }

    toOtherVersion(version) {
        if (version === 1) {
            return new ResendResponseResentV1(this.payload.streamId, this.payload.streamPartition, this.payload.subId)
        }
        throw new UnsupportedVersionError(version, 'Supported versions: [0, 1]')
    }

    static getConstructorArguments(payload) {
        return [payload.streamId, payload.streamPartition, payload.subId]
    }

    static getConstructorArgs(array) {
        const payloadObject = array[1] // index 0 is the null subId
        const payload = ResendResponsePayload.deserialize(payloadObject)
        return [payload.streamId, payload.streamPartition, payload.subId]
    }
}

ControlMessage.registerClass(VERSION, ResendResponseResent.TYPE, ResendResponseResentV0)
