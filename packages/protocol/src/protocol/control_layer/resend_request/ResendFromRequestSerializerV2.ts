import ControlMessage from '../ControlMessage'
import MessageRef from '../../message_layer/MessageRef'

import ResendFromRequest from './ResendFromRequest'

import { Serializer } from '../../../Serializer'

const VERSION = 2

export default class ResendFromRequestSerializerV2 extends Serializer<ResendFromRequest> {
    toArray(resendFromRequest: ResendFromRequest) {
        return [
            VERSION,
            ControlMessage.TYPES.ResendFromRequest,
            resendFromRequest.requestId,
            resendFromRequest.streamId,
            resendFromRequest.streamPartition,
            resendFromRequest.fromMsgRef.toArray(),
            resendFromRequest.publisherId,
            resendFromRequest.sessionToken,
        ]
    }

    fromArray(arr: any[]) {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            requestId,
            streamId,
            streamPartition,
            fromMsgRefArray,
            publisherId,
            sessionToken,
        ] = arr

        const [ fromTimestamp, fromSequenceNumber ] = fromMsgRefArray
        return new ResendFromRequest({
            version, requestId, streamId, streamPartition, fromMsgRef: new MessageRef(fromTimestamp, fromSequenceNumber), publisherId, sessionToken
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.ResendFromRequest, new ResendFromRequestSerializerV2())
