import ControlMessage from '../ControlMessage'
import MessageRef from '../../message_layer/MessageRef'

import ResendRangeRequest from './ResendRangeRequest'

import { Serializer } from '../../../Serializer'
import { toStreamID } from '../../../utils/StreamID'

const VERSION = 1

export default class ResendRangeRequestSerializerV1 extends Serializer<ResendRangeRequest> {
    toArray(resendRangeRequest: ResendRangeRequest): any[] {
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

    fromArray(arr: any[]): ResendRangeRequest {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            streamId,
            streamPartition,
            requestId,
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
            streamId: toStreamID(streamId),
            streamPartition,
            fromMsgRef: new MessageRef(fromTimestamp, fromSequenceNumber),
            toMsgRef: new MessageRef(toTimestamp, toSequenceNumber),
            publisherId,
            msgChainId,
            sessionToken
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.ResendRangeRequest, new ResendRangeRequestSerializerV1())
