import ControlMessage from '../ControlMessage'

import ResendResponseResent from './ResendResponseResent'

const VERSION = 2

export default class ResendResponseResentSerializerV2 {
    static toArray(resendResponseResent) {
        return [
            VERSION,
            ControlMessage.TYPES.ResendResponseResent,
            resendResponseResent.requestId,
            resendResponseResent.streamId,
            resendResponseResent.streamPartition,
        ]
    }

    static fromArray(arr) {
        const [
            version,
            type, // eslint-disable-line no-unused-vars
            requestId,
            streamId,
            streamPartition,
        ] = arr

        return new ResendResponseResent({
            version, requestId, streamId, streamPartition
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.ResendResponseResent, ResendResponseResentSerializerV2)
