import ControlMessage from '../ControlMessage'
import MessageRef from '../../message_layer/MessageRef'

import ResendRangeRequest from './ResendRangeRequest'

const VERSION = 1

export default class ResendRangeRequestSerializerV1 {
    static toArray(resendRangeRequest) {
        return [
            VERSION,
            ControlMessage.TYPES.ResendRangeRequest,
            resendRangeRequest.streamId,
            resendRangeRequest.streamPartition,
            resendRangeRequest.requestId,
            resendRangeRequest.fromMsgRef.toArray(),
            resendRangeRequest.toMsgRef.toArray(),
            resendRangeRequest.publisherId,
            resendRangeRequest.msgChainId,
            resendRangeRequest.sessionToken,
        ]
    }

    static fromArray(arr) {
        const [
            version,
            type, // eslint-disable-line no-unused-vars
            streamId,
            streamPartition,
            requestId,
            fromMsgRefArr,
            toMsgRefArr,
            publisherId,
            msgChainId,
            sessionToken,
        ] = arr

        return new ResendRangeRequest(version, requestId, streamId, streamPartition,
            new MessageRef(...fromMsgRefArr), new MessageRef(...toMsgRefArr), publisherId, msgChainId, sessionToken)
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.ResendRangeRequest, ResendRangeRequestSerializerV1)
