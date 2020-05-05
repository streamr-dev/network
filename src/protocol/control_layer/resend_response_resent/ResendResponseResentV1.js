import { validateIsNotEmptyString, validateIsNotNegativeInteger } from '../../../utils/validations'
import UnsupportedVersionError from '../../../errors/UnsupportedVersionError'
import ControlMessage from '../ControlMessage'

import ResendResponseResent from './ResendResponseResent'
import ResendResponseResentV0 from './ResendResponseResentV0'

const VERSION = 1

export default class ResendResponseResentV1 extends ResendResponseResent {
    constructor(streamId, streamPartition, requestId) {
        super(VERSION)

        validateIsNotEmptyString('streamId', streamId)
        validateIsNotNegativeInteger('streamPartition', streamPartition)
        validateIsNotEmptyString('requestId', requestId)

        this.streamId = streamId
        this.streamPartition = streamPartition
        this.requestId = requestId
    }

    toArray() {
        const array = super.toArray()
        array.push(...[
            this.streamId,
            this.streamPartition,
            this.requestId,
        ])
        return array
    }

    toOtherVersion(version) {
        if (version === 0) {
            return new ResendResponseResentV0(this.streamId, this.streamPartition, this.requestId)
        }
        throw new UnsupportedVersionError(version, 'Supported versions: [0, 1]')
    }
}

ControlMessage.registerClass(VERSION, ResendResponseResent.TYPE, ResendResponseResentV1)
