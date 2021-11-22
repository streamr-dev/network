import ControlMessage from '../ControlMessage'

import PublishStreamConnectionRequest from "./PublishStreamConnectionRequest"

import { Serializer } from '../../../Serializer'

const VERSION = 2

export default class PublishStreamConnectionRequestSerializerV2 extends Serializer<PublishStreamConnectionRequest> {
    toArray(publishStreamConnectionRequest: PublishStreamConnectionRequest): any[] {
        return [
            VERSION,
            ControlMessage.TYPES.PublishStreamConnectionRequest,
            publishStreamConnectionRequest.requestId,
            publishStreamConnectionRequest.streamId,
            publishStreamConnectionRequest.streamPartition,
            publishStreamConnectionRequest.senderId,
        ]
    }

    fromArray(arr: any[]): PublishStreamConnectionRequest {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            requestId,
            streamId,
            streamPartition,
            senderId,
        ] = arr

        return new PublishStreamConnectionRequest({
            version,
            requestId,
            streamId,
            streamPartition,
            senderId,
        })
    }
}

ControlMessage.registerSerializer(VERSION, ControlMessage.TYPES.PublishStreamConnectionRequest, new PublishStreamConnectionRequestSerializerV2())
