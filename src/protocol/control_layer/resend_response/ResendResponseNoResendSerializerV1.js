import ControlMessage from '../ControlMessage'

import ResendResponseNoResend from './ResendResponseNoResend'

const VERSION = 1

export default class ResendResponseNoResendSerializerV1 {
    static toArray(resendResponseNoResend) {
        return [
            VERSION,
            ControlMessage.TYPES.ResendResponseNoResend,
            resendResponseNoResend.streamId,
            resendResponseNoResend.streamPartition,
            resendResponseNoResend.requestId,
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

        return new ResendResponseNoResend({
            version, requestId, streamId, streamPartition
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.ResendResponseNoResend, ResendResponseNoResendSerializerV1)
