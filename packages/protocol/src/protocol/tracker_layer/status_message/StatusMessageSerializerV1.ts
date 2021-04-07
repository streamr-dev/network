import TrackerMessage from '../TrackerMessage'

import StatusMessage from './StatusMessage'

import { Serializer } from '../../../Serializer'

const VERSION = 1

export default class StatusMessageSerializerV1 extends Serializer<StatusMessage> {
    toArray(statusMessage: StatusMessage) {
        return [
            VERSION,
            TrackerMessage.TYPES.StatusMessage,
            statusMessage.requestId,
            statusMessage.status
        ]
    }

    fromArray(arr: any[]) {
        const [
            version,
            type, // eslint-disable-line no-unused-vars
            requestId,
            status
        ] = arr

        return new StatusMessage({
            version, requestId, status
        })
    }
}

TrackerMessage.registerSerializer(VERSION, TrackerMessage.TYPES.StatusMessage, new StatusMessageSerializerV1())
