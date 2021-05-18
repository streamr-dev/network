import ControlMessage from '../ControlMessage'

import ResendResponseNoResend from './ResendResponseNoResend'

import { Serializer } from '../../../Serializer'

const VERSION = 1

export default class ResendResponseNoResendSerializerV1 extends Serializer<ResendResponseNoResend> {
    toArray(resendResponseNoResend: ResendResponseNoResend) {
        return [
            VERSION,
            ControlMessage.TYPES.ResendResponseNoResend,
            resendResponseNoResend.streamId,
            resendResponseNoResend.streamPartition,
            resendResponseNoResend.requestId,
        ]
    }

    fromArray(arr: any[]) {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            streamId,
            streamPartition,
            requestId,
        ] = arr

        return new ResendResponseNoResend({
            version, requestId, streamId, streamPartition
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.ResendResponseNoResend, new ResendResponseNoResendSerializerV1())
