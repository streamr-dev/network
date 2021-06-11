/* eslint-disable array-bracket-spacing */
import StreamMessageCreator from '../../src/publish/MessageCreator'
import { StreamIDish } from '../../src/publish/utils'
import { createMockAddress } from '../utils'

const MOCK_STREAM_ID = 'mock-stream-id'
const MOCK_STREAM_PARTITION = 123
const MOCK_CONTENT = { foo: 'bar' }
const MOCK_TIMESTAMP = 1234567890
const DEFAULT_STREAM_PARTITION = 0

const createMockMessageCreator = () => {
    const userAddress = createMockAddress()
    const cachedStream = {
        id: MOCK_STREAM_ID,
        partitions: 456
    }
    const client = {
        options: {},
        cached: {
            getStream: jest.fn().mockResolvedValueOnce(cachedStream),
            getUserId: jest.fn().mockResolvedValueOnce(undefined)
        },
        canEncrypt: jest.fn().mockReturnValue(true),
        getAddress: jest.fn().mockResolvedValue(userAddress)
    }
    return new StreamMessageCreator(client as any)
}

const createMockMessage = async (streamObjectOrId: StreamIDish) => {
    const creator = createMockMessageCreator()
    return creator.create(streamObjectOrId, {
        content: MOCK_CONTENT,
        timestamp: MOCK_TIMESTAMP
    })
}

describe('MessageCreator', () => {

    describe.each([
        // See NET-344 for possible specification change for the first three assertions
        [ MOCK_STREAM_ID, DEFAULT_STREAM_PARTITION ],
        [ { id: MOCK_STREAM_ID }, DEFAULT_STREAM_PARTITION ],
        [ { streamId: MOCK_STREAM_ID }, DEFAULT_STREAM_PARTITION ],
        [ { id: MOCK_STREAM_ID, partition: MOCK_STREAM_PARTITION }, MOCK_STREAM_PARTITION ],
        [ { streamId: MOCK_STREAM_ID, streamPartition: MOCK_STREAM_PARTITION }, MOCK_STREAM_PARTITION ]
    ])('valid', (definition: StreamIDish, expectedPartition: number) => {
        it(JSON.stringify(definition), async () => {
            const msg = await createMockMessage(definition)
            expect(msg.getParsedContent()).toBe(MOCK_CONTENT)
            expect(msg.messageId.streamId).toBe(MOCK_STREAM_ID)
            expect(msg.messageId.streamPartition).toBe(expectedPartition)
            expect(msg.messageId.timestamp).toBe(MOCK_TIMESTAMP)
        })
    })

    describe.each([
        [ { partition: MOCK_STREAM_PARTITION }],
        [ { streamPartition: MOCK_STREAM_PARTITION }],
        [ {} ],
    ])('invalid', (definition: StreamIDish) => {
        it(JSON.stringify(definition), () => {
            return expect(() => createMockMessage(definition)).rejects.toThrow(
                'First argument must be a Stream object or the stream id!'
            )
        })
    })
})
