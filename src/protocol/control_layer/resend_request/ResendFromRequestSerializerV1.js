import ControlMessage from '../ControlMessage'
import MessageRef from '../../message_layer/MessageRef'

import ResendFromRequest from './ResendFromRequest'

const VERSION = 1

export default class ResendFromRequestSerializerV1 {
    static toArray(resendFromRequest) {
        return [
            VERSION,
            ControlMessage.TYPES.ResendFromRequest,
            resendFromRequest.streamId,
            resendFromRequest.streamPartition,
            resendFromRequest.requestId,
            resendFromRequest.fromMsgRef.toArray(),
            resendFromRequest.publisherId,
            null, // msgChainId is in V1 accidentally
            resendFromRequest.sessionToken,
        ]
    }

    static fromArray(arr) {
        const [
            version,
            type, // eslint-disable-line no-unused-vars
            streamId,
            streamPartition,
            requestId,
            fromMsgRefArray,
            publisherId,
            // unused: in V1 accidentally
            msgChainId, // eslint-disable-line no-unused-vars
            sessionToken,
        ] = arr

        return new ResendFromRequest({
            version, requestId, streamId, streamPartition, fromMsgRef: new MessageRef(...fromMsgRefArray), publisherId, sessionToken
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.ResendFromRequest, ResendFromRequestSerializerV1)
