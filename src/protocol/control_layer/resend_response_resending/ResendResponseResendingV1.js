import { validateIsNotEmptyString, validateIsNotNegativeInteger } from '../../../utils/validations'
import UnsupportedVersionError from '../../../errors/UnsupportedVersionError'
import ControlMessage from '../ControlMessage'
import ResendResponseResending from './ResendResponseResending'
import ResendResponseResendingV0 from './ResendResponseResendingV0'

const VERSION = 1

export default class ResendResponseResendingV1 extends ResendResponseResending {
    constructor(streamId, streamPartition, subId) {
        super(VERSION)

        validateIsNotEmptyString('streamId', streamId)
        validateIsNotNegativeInteger('streamPartition', streamPartition)
        validateIsNotEmptyString('subId', subId)

        this.streamId = streamId
        this.streamPartition = streamPartition
        this.subId = subId
    }

    toArray() {
        const array = super.toArray()
        array.push(...[
            this.streamId,
            this.streamPartition,
            this.subId,
        ])
        return array
    }

    toOtherVersion(version) {
        if (version === 0) {
            return new ResendResponseResendingV0(this.streamId, this.streamPartition, this.subId)
        }
        throw new UnsupportedVersionError(version, 'Supported versions: [0, 1]')
    }
}

ControlMessage.registerClass(VERSION, ResendResponseResending.TYPE, ResendResponseResendingV1)
