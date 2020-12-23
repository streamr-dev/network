import TrackerMessage from '../TrackerMessage'

import StorageNodesResponse from './StorageNodesResponse'

import { Serializer } from '../../../Serializer'

const VERSION = 1

export default class StorageNodesResponseSerializerV1 extends Serializer<StorageNodesResponse> {
    toArray(storageNodesResponse: StorageNodesResponse) {
        return [
            VERSION,
            TrackerMessage.TYPES.StorageNodesResponse,
            storageNodesResponse.requestId,
            storageNodesResponse.streamId,
            storageNodesResponse.streamPartition,
            storageNodesResponse.nodeIds
        ]
    }

    fromArray(arr: any[]) {
        const [
            version,
            type, // eslint-disable-line no-unused-vars
            requestId,
            streamId,
            streamPartition,
            nodeIds
        ] = arr

        return new StorageNodesResponse({
            version, requestId, streamId, streamPartition, nodeIds
        })
    }
}

TrackerMessage.registerSerializer(VERSION, TrackerMessage.TYPES.StorageNodesResponse, new StorageNodesResponseSerializerV1())
