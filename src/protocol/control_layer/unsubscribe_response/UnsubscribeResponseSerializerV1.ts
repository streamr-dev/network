import ControlMessage, { PLACEHOLDER_REQUEST_ID_PROTOCOL_V1 } from '../ControlMessage'

import UnsubscribeResponse from './UnsubscribeResponse'

import { Serializer } from '../../../Serializer'

const VERSION = 1

export default class UnsubscribeResponseSerializerV1 extends Serializer<UnsubscribeResponse> {
    toArray(unsubscribeResponse: UnsubscribeResponse) {
        return [
            VERSION,
            ControlMessage.TYPES.UnsubscribeResponse,
            unsubscribeResponse.streamId,
            unsubscribeResponse.streamPartition,
        ]
    }

    fromArray(arr: any[]) {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            streamId,
            streamPartition,
        ] = arr

        return new UnsubscribeResponse({
            version, streamId, streamPartition, requestId: PLACEHOLDER_REQUEST_ID_PROTOCOL_V1
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.UnsubscribeResponse, new UnsubscribeResponseSerializerV1())
