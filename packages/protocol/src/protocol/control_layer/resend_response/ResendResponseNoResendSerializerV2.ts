import ControlMessage from '../ControlMessage'

import ResendResponseNoResend from './ResendResponseNoResend'

import { Serializer } from '../../../Serializer'

const VERSION = 2

export default class ResendResponseNoResendSerializerV2 extends Serializer<ResendResponseNoResend> {
    toArray(resendResponseNoResend: ResendResponseNoResend): any[] {
        return [
            VERSION,
            ControlMessage.TYPES.ResendResponseNoResend,
            resendResponseNoResend.requestId,
            resendResponseNoResend.streamId,
            resendResponseNoResend.streamPartition,
        ]
    }

    fromArray(arr: any[]): ResendResponseNoResend {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            requestId,
            streamId,
            streamPartition,
        ] = arr

        return new ResendResponseNoResend({
            version, requestId, streamId, streamPartition
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.ResendResponseNoResend, new ResendResponseNoResendSerializerV2())
