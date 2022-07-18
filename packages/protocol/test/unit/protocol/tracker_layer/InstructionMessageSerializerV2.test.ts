import assert from 'assert'

import { InstructionMessage, toStreamID } from '../../../../src'
import TrackerMessage from '../../../../src/protocol/tracker_layer/TrackerMessage'

const VERSION = 2

// Message definitions
const message = new InstructionMessage({
    version: VERSION,
    requestId: 'requestId',
    streamId: toStreamID('streamId'),
    streamPartition: 10,
    nodeIds: ['node-1', 'node-2'],
    counter: 100
})
const serializedMessage = JSON.stringify([
    VERSION,
    TrackerMessage.TYPES.InstructionMessage,
    'requestId',
    'streamId',
    10,
    ['node-1', 'node-2'],
    100
])

describe('InstructionMessageSerializerV2', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            assert.deepStrictEqual(TrackerMessage.deserialize(serializedMessage), message)
        })
    })
    describe('serialize', () => {
        it('correctly serializes messages', () => {
            assert.deepStrictEqual(message.serialize(VERSION), serializedMessage)
        })
    })
})
