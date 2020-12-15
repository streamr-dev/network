import TrackerMessage from '../TrackerMessage'

import RelayMessage from './RelayMessage'

const VERSION = 1

export default class RelayMessageSerializerV1 {
    static toArray(relayMessage) {
        return [
            VERSION,
            TrackerMessage.TYPES.RelayMessage,
            relayMessage.requestId,
            relayMessage.originator,
            relayMessage.targetNode,
            relayMessage.subType,
            relayMessage.data
        ]
    }

    static fromArray(arr) {
        const [
            version,
            type, // eslint-disable-line no-unused-vars
            requestId,
            originator,
            targetNode,
            subType,
            data
        ] = arr

        return new RelayMessage({
            version, requestId, originator, targetNode, subType, data
        })
    }
}

TrackerMessage.registerSerializer(VERSION, TrackerMessage.TYPES.RelayMessage, RelayMessageSerializerV1)
