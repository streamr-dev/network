import ControlMessage from '../ControlMessage'
import MessageRef from '../../message_layer/MessageRef'

import ResendRangeRequest from './ResendRangeRequest'

const VERSION = 2

export default class ResendRangeRequestSerializerV2 {
    static toArray(resendRangeRequest) {
        return [
            VERSION,
            ControlMessage.TYPES.ResendRangeRequest,
            resendRangeRequest.requestId,
            resendRangeRequest.streamId,
            resendRangeRequest.streamPartition,
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
            requestId,
            streamId,
            streamPartition,
            fromMsgRefArr,
            toMsgRefArr,
            publisherId,
            msgChainId,
            sessionToken,
        ] = arr

        return new ResendRangeRequest({
            version,
            requestId,
            streamId,
            streamPartition,
            fromMsgRef: new MessageRef(...fromMsgRefArr),
            toMsgRef: new MessageRef(...toMsgRefArr),
            publisherId,
            msgChainId,
            sessionToken
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.ResendRangeRequest, ResendRangeRequestSerializerV2)
