import ControlMessage from '../ControlMessage'

import ResendResponseResending from './ResendResponseResending'

import { Serializer } from '../../../Serializer'

const VERSION = 2

export default class ResendResponseResendingSerializerV2 extends Serializer<ResendResponseResending> {
    toArray(resendResponseResending: ResendResponseResending) {
        return [
            VERSION,
            ControlMessage.TYPES.ResendResponseResending,
            resendResponseResending.requestId,
            resendResponseResending.streamId,
            resendResponseResending.streamPartition,
        ]
    }

    fromArray(arr: any[]) {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            requestId,
            streamId,
            streamPartition,
        ] = arr

        return new ResendResponseResending({
            version, requestId, streamId, streamPartition
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.ResendResponseResending, new ResendResponseResendingSerializerV2())
