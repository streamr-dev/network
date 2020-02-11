import UnsupportedVersionError from '../../../errors/UnsupportedVersionError'
import { validateIsNotEmptyString, validateIsNotNegativeInteger } from '../../../utils/validations'
import ControlMessage from '../ControlMessage'
import UnsubscribeResponse from './UnsubscribeResponse'
import UnsubscribeResponseV0 from './UnsubscribeResponseV0'

const VERSION = 1

export default class UnsubscribeResponseV1 extends UnsubscribeResponse {
    constructor(streamId, streamPartition = 0) {
        super(VERSION)

        validateIsNotEmptyString('streamId', streamId)
        validateIsNotNegativeInteger('streamPartition', streamPartition)

        this.streamId = streamId
        this.streamPartition = streamPartition
    }

    toArray() {
        const array = super.toArray()
        array.push(...[
            this.streamId,
            this.streamPartition,
        ])
        return array
    }

    toOtherVersion(version) {
        if (version === 0) {
            return new UnsubscribeResponseV0(this.streamId, this.streamPartition)
        }
        throw new UnsupportedVersionError(version, 'Supported versions: [0, 1]')
    }
}

ControlMessage.registerClass(VERSION, UnsubscribeResponse.TYPE, UnsubscribeResponseV1)
