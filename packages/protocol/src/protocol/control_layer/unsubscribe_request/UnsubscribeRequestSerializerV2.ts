import ControlMessage from '../ControlMessage'

import UnsubscribeRequest from './UnsubscribeRequest'

import { Serializer } from '../../../Serializer'
import { toStreamID } from '../../../../src/utils/StreamID'

const VERSION = 2

/* eslint-disable class-methods-use-this */
export default class UnsubscribeRequestSerializerV2 extends Serializer<UnsubscribeRequest> {
    toArray(unsubscribeRequest: UnsubscribeRequest): any[] {
        return [
            VERSION,
            ControlMessage.TYPES.UnsubscribeRequest,
            unsubscribeRequest.requestId,
            unsubscribeRequest.streamId,
            unsubscribeRequest.streamPartition,
        ]
    }

    fromArray(arr: any[]): UnsubscribeRequest {
        const [
            version,
            _type,
            requestId,
            streamId,
            streamPartition,
        ] = arr

        return new UnsubscribeRequest({
            version,
            requestId,
            streamId: toStreamID(streamId),
            streamPartition
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.UnsubscribeRequest, new UnsubscribeRequestSerializerV2())
