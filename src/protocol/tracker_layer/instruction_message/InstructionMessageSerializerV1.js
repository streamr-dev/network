import TrackerMessage from '../TrackerMessage'

import InstructionMessage from './InstructionMessage'

const VERSION = 1

export default class InstructionMessageSerializerV1 {
    static toArray(instructionMessage) {
        return [
            VERSION,
            TrackerMessage.TYPES.InstructionMessage,
            instructionMessage.requestId,
            instructionMessage.streamId,
            instructionMessage.streamPartition,
            instructionMessage.nodeAddresses,
            instructionMessage.counter
        ]
    }

    static fromArray(arr) {
        const [
            version,
            type, // eslint-disable-line no-unused-vars
            requestId,
            streamId,
            streamPartition,
            nodeAddresses,
            counter
        ] = arr

        return new InstructionMessage({
            version, requestId, streamId, streamPartition, nodeAddresses, counter
        })
    }
}

TrackerMessage.registerSerializer(VERSION, TrackerMessage.TYPES.InstructionMessage, InstructionMessageSerializerV1)
