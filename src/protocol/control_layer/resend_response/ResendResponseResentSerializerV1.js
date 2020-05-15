import ControlMessage from '../ControlMessage'

import ResendResponseResent from './ResendResponseResent'

const VERSION = 1

export default class ResendResponseResentSerializerV1 {
    static toArray(resendResponseResent) {
        return [
            VERSION,
            ControlMessage.TYPES.ResendResponseResent,
            resendResponseResent.streamId,
            resendResponseResent.streamPartition,
            resendResponseResent.requestId,
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

        return new ResendResponseResent(version, requestId, streamId, streamPartition)
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.ResendResponseResent, ResendResponseResentSerializerV1)
