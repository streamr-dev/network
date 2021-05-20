import ControlMessage from '../ControlMessage'
import MessageRef from '../../message_layer/MessageRef'

import ResendRangeRequest from './ResendRangeRequest'

import { Serializer } from '../../../Serializer'

const VERSION = 2

export default class ResendRangeRequestSerializerV2 extends Serializer<ResendRangeRequest> {
    toArray(resendRangeRequest: ResendRangeRequest) {
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

    fromArray(arr: any[]) {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            requestId,
            streamId,
            streamPartition,
            fromMsgRefArr,
            toMsgRefArr,
            publisherId,
            msgChainId,
            sessionToken,
        ] = arr

        const [ fromTimestamp, fromSequenceNumber ] = fromMsgRefArr
        const [ toTimestamp, toSequenceNumber ] = toMsgRefArr
        return new ResendRangeRequest({
            version,
            requestId,
            streamId,
            streamPartition,
            fromMsgRef: new MessageRef(fromTimestamp, fromSequenceNumber),
            toMsgRef: new MessageRef(toTimestamp, toSequenceNumber),
            publisherId,
            msgChainId,
            sessionToken
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.ResendRangeRequest, new ResendRangeRequestSerializerV2())
