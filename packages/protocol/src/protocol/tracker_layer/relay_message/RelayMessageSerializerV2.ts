import TrackerMessage from '../TrackerMessage'

import RelayMessage from './RelayMessage'

import { Serializer } from '../../../Serializer'

const VERSION = 2

/* eslint-disable class-methods-use-this */
export default class RelayMessageSerializerV2 extends Serializer<RelayMessage> {
    toArray(relayMessage: RelayMessage): any[] {
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

    fromArray(arr: any[]): RelayMessage {
        const [
            version,
            _type,
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

TrackerMessage.registerSerializer(VERSION, TrackerMessage.TYPES.RelayMessage, new RelayMessageSerializerV2())
