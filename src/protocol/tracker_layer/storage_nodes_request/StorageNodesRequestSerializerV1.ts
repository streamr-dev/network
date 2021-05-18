import TrackerMessage from '../TrackerMessage'

import StorageNodesRequest from './StorageNodesRequest'

import { Serializer } from '../../../Serializer'

const VERSION = 1

export default class StorageNodesRequestSerializerV1 extends Serializer<StorageNodesRequest> {
    toArray(storageNodesRequest: StorageNodesRequest) {
        return [
            VERSION,
            TrackerMessage.TYPES.StorageNodesRequest,
            storageNodesRequest.requestId,
            storageNodesRequest.streamId,
            storageNodesRequest.streamPartition,
        ]
    }

    fromArray(arr: any[]) {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            requestId,
            streamId,
            streamPartition,
        ] = arr

        return new StorageNodesRequest({
            version, requestId, streamId, streamPartition
        })
    }
}

TrackerMessage.registerSerializer(VERSION, TrackerMessage.TYPES.StorageNodesRequest, new StorageNodesRequestSerializerV1())
