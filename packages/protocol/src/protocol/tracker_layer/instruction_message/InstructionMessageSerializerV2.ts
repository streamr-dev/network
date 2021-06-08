import TrackerMessage from '../TrackerMessage'

import InstructionMessage from './InstructionMessage'

import { Serializer } from '../../../Serializer'

const VERSION = 2

export default class InstructionMessageSerializerV2 extends Serializer<InstructionMessage> {
    toArray(instructionMessage: InstructionMessage) {
        return [
            VERSION,
            TrackerMessage.TYPES.InstructionMessage,
            instructionMessage.requestId,
            instructionMessage.streamId,
            instructionMessage.streamPartition,
            instructionMessage.nodeIds,
            instructionMessage.counter
        ]
    }

    fromArray(arr: any[]) {
        const [
            version,
            type, // eslint-disable-line @typescript-eslint/no-unused-vars
            requestId,
            streamId,
            streamPartition,
            nodeIds,
            counter
        ] = arr

        return new InstructionMessage({
            version, requestId, streamId, streamPartition, nodeIds, counter
        })
    }
}

TrackerMessage.registerSerializer(VERSION, TrackerMessage.TYPES.InstructionMessage, new InstructionMessageSerializerV2())
