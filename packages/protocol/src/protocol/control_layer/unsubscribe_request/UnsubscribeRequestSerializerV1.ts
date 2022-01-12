import ControlMessage, { PLACEHOLDER_REQUEST_ID_PROTOCOL_V1 } from '../ControlMessage'

import UnsubscribeRequest from './UnsubscribeRequest'

import { Serializer } from '../../../Serializer'
import { StreamIDUtils } from '../../../utils/StreamID'

const VERSION = 1

export default class UnsubscribeRequestSerializerV1 extends Serializer<UnsubscribeRequest> {
    toArray(unsubscribeRequest: UnsubscribeRequest): any[] {
        return [
            VERSION,
            ControlMessage.TYPES.UnsubscribeRequest,
            unsubscribeRequest.streamId,
            unsubscribeRequest.streamPartition,
        ]
    }

    fromArray(arr: any[]): UnsubscribeRequest {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            streamId,
            streamPartition,
        ] = arr

        return new UnsubscribeRequest({
            version,
            streamId: StreamIDUtils.toStreamID(streamId),
            streamPartition,
            requestId: PLACEHOLDER_REQUEST_ID_PROTOCOL_V1
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.UnsubscribeRequest, new UnsubscribeRequestSerializerV1())
