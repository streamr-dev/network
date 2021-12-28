import ControlMessage from '../ControlMessage'

import ResendResponseResending from './ResendResponseResending'

import { Serializer } from '../../../Serializer'
import { toStreamID } from '../../../utils/StreamID'

const VERSION = 2

export default class ResendResponseResendingSerializerV2 extends Serializer<ResendResponseResending> {
    toArray(resendResponseResending: ResendResponseResending): any[] {
        return [
            VERSION,
            ControlMessage.TYPES.ResendResponseResending,
            resendResponseResending.requestId,
            resendResponseResending.streamId,
            resendResponseResending.streamPartition,
        ]
    }

    fromArray(arr: any[]): ResendResponseResending {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            requestId,
            streamId,
            streamPartition,
        ] = arr

        return new ResendResponseResending({
            version,
            requestId,
            streamId: toStreamID(streamId),
            streamPartition
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.ResendResponseResending, new ResendResponseResendingSerializerV2())
