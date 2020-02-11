import { validateIsNotEmptyString, validateIsNotNegativeInteger } from '../../../utils/validations'
import UnsupportedVersionError from '../../../errors/UnsupportedVersionError'
import ControlMessage from '../ControlMessage'
import SubscribeResponse from './SubscribeResponse'
import SubscribeResponseV0 from './SubscribeResponseV0'

const VERSION = 1

export default class SubscribeResponseV1 extends SubscribeResponse {
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
            return new SubscribeResponseV0(this.streamId, this.streamPartition)
        }
        throw new UnsupportedVersionError(version, 'Supported versions: [0, 1]')
    }
}

ControlMessage.registerClass(VERSION, SubscribeResponse.TYPE, SubscribeResponseV1)
