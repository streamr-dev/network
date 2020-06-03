import ControlMessage from '../ControlMessage'

import ResendResponseResending from './ResendResponseResending'

const VERSION = 1

export default class ResendResponseResendingSerializerV1 {
    static toArray(resendResponseResending) {
        return [
            VERSION,
            ControlMessage.TYPES.ResendResponseResending,
            resendResponseResending.streamId,
            resendResponseResending.streamPartition,
            resendResponseResending.requestId,
        ]
    }

    static fromArray(arr) {
        const [
            version,
            type, // eslint-disable-line no-unused-vars
            streamId,
            streamPartition,
            requestId,
        ] = arr

        return new ResendResponseResending({
            version, requestId, streamId, streamPartition
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.ResendResponseResending, ResendResponseResendingSerializerV1)
