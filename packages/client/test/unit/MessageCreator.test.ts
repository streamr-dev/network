/* eslint-disable array-bracket-spacing */
import StreamMessageCreator from '../../src/publish/MessageCreator'
import { StreamIDish } from '../../src/publish/utils'
import { createMockAddress } from '../utils'

const MOCK_STREAM_ID = 'mock-stream-id'
const MOCK_STREAM_PARTITION = 123
const MOCK_PARTITION_KEY = 'mock-partition-key'
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

const createMockMessage = async (streamObjectOrId: StreamIDish, partitionKey?: string) => {
    const creator = createMockMessageCreator()
    return creator.create(streamObjectOrId, {
        content: MOCK_CONTENT,
        timestamp: MOCK_TIMESTAMP,
        partitionKey
    })
}

describe('MessageCreator', () => {

    describe('parse partition', () => {

        describe.each([
            // See NET-344 for possible specification change for the first three assertions
            [ MOCK_STREAM_ID, undefined, DEFAULT_STREAM_PARTITION ],
            [ { id: MOCK_STREAM_ID }, undefined, DEFAULT_STREAM_PARTITION ],
            [ { streamId: MOCK_STREAM_ID }, undefined, DEFAULT_STREAM_PARTITION ],
            [ { id: MOCK_STREAM_ID, partition: MOCK_STREAM_PARTITION }, undefined, MOCK_STREAM_PARTITION ],
            [ { streamId: MOCK_STREAM_ID, streamPartition: MOCK_STREAM_PARTITION }, undefined, MOCK_STREAM_PARTITION ],
            [ MOCK_STREAM_ID, MOCK_PARTITION_KEY, 85 ]
        ])('valid: %p %p', (definition: StreamIDish, partitionKey: string|undefined, expectedPartition: number) => {
            it('', async () => {
                const msg = await createMockMessage(definition, partitionKey)
                expect(msg.getParsedContent()).toBe(MOCK_CONTENT)
                expect(msg.messageId.streamId).toBe(MOCK_STREAM_ID)
                expect(msg.messageId.streamPartition).toBe(expectedPartition)
                expect(msg.messageId.timestamp).toBe(MOCK_TIMESTAMP)
            })
        })

        describe.each([
            [ { partition: MOCK_STREAM_PARTITION }, undefined, 'First argument must be a Stream object or the stream id!'],
            [ { streamPartition: MOCK_STREAM_PARTITION }, undefined, 'First argument must be a Stream object or the stream id!'],
            [ {}, undefined, 'First argument must be a Stream object or the stream id!' ],
            [ { id: MOCK_STREAM_ID, partition: MOCK_STREAM_PARTITION }, MOCK_PARTITION_KEY, 'Invalid combination of "partition" and "partitionKey"']
        ])('invalid: %p %p', (definition: StreamIDish, partitionKey: string|undefined, expectedErrorMessage: string) => {
            it('', () => {
                return expect(() => createMockMessage(definition, partitionKey)).rejects.toThrow(expectedErrorMessage)
            })
        })

    })
})
