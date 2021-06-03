import { Readable, PassThrough } from 'stream'
import { Protocol } from 'streamr-network'
import { Storage } from '../../../../src/plugins/storage/Storage'
const { StreamMessage, MessageID } = Protocol.MessageLayer

const MOCK_STREAM_ID = 'mock-stream-id'
const MOCK_BUCKET = {
    id: 'mock-bucket-id'
}
const MOCK_MESSAGE_COUNT = {
    total: {
        low: 1
    }
}
const createMockMessage = (contentValue: number) => {
    return {
        payload: new StreamMessage({
            messageId: new MessageID(MOCK_STREAM_ID, 0, Date.now(), 0, 'publisherId', 'msgChainId'),
            content: {
                value: contentValue
            }
        }).serialize()
    }
}
const MOCK_MESSAGE_1 = createMockMessage(1)
const MOCK_MESSAGE_2 = createMockMessage(2)
const REQUEST_TYPE_FROM = 'requestFrom'
const REQUEST_TYPE_RANGE = 'requestRange'

const createResultFactory = ({
    buckets,
    messageCounts,
    messages
}: {
    buckets?: { id: string}[]|Error,
    messageCounts?: { total: { low: number } }[]|Error,
    messages?: { payload: string }[]|Error
}) => {
    return (query: string) => {
        if (query.includes('FROM bucket')) {
            return buckets!
        } else if (query.includes('total FROM stream_data')) {
            return messageCounts!
        } else if (query.includes('payload FROM stream_data')) {
            return messages!
        } else {
            throw new Error(`Assertion failed: query="${query}"`)
        }
    }
}

const createMockStorage = (getResults: (query: string) => any[]|Error) => {
    const cassandraClient = {
        eachRow: jest.fn().mockImplementation((
            query: string,
            _params: any[],
            _options: any,
            rowCallback: (n: number, row: any) => void,
            resultCallback?: (err: Error|undefined, result: any) => void
        ) => {
            const rows = getResults(query)
            if (rows instanceof Error) {
                resultCallback!(rows, undefined)
            } else {
                rows.forEach((row: any, index: number) => rowCallback!(index, row))
                resultCallback!(undefined, rows)
            }
        }),
        execute: jest.fn().mockImplementation((query: string): Promise<any> => {
            const rows = getResults(query)
            if (rows instanceof Error) {
                return Promise.reject(rows)
            } else { 
                return Promise.resolve({
                    first: () => rows[0],
                    rows
                })
            }
        }),
        stream: jest.fn().mockImplementation((query: string): PassThrough => {
            const rows = getResults(query)
            const stream = new PassThrough({
                objectMode: true
            })
            if (rows instanceof Error) {
                stream.destroy(rows)
            } else { 
                rows.forEach((row) => stream.write(row))
                stream.push(null)
            }
            return stream
        })
    }
    return new Storage(cassandraClient as any, {})
}

describe('Storage', () => {

    describe('requestLast', () => {

        it('happy path', (done) => {
            const storage = createMockStorage(createResultFactory({
                buckets: [MOCK_BUCKET],
                messageCounts: [MOCK_MESSAGE_COUNT],
                messages: [MOCK_MESSAGE_2]
            }))
            const resultStream = storage.requestLast(MOCK_STREAM_ID, 0, 1)
            const onData = jest.fn()
            resultStream.on('data', onData)
            resultStream.on('end', () => {
                expect(onData).toBeCalledTimes(1)
                expect(onData.mock.calls[0][0].serialize()).toEqual(MOCK_MESSAGE_2.payload)
                done()
            })
        })

        it('no messages', (done) => {
            const storage = createMockStorage(createResultFactory({
                buckets: [],
            }))
            const resultStream = storage.requestLast(MOCK_STREAM_ID, 0, 1)
            const onData = jest.fn()
            resultStream.on('data', onData)
            resultStream.on('end', () => {
                expect(onData).not.toBeCalled()
                done()
            })
        })

        it('bucket query error', (done) => {
            const expectedError = new Error('bucket-error')
            const storage = createMockStorage(createResultFactory({
                buckets: expectedError
            }))
            const resultStream = storage.requestLast(MOCK_STREAM_ID, 0, 1)
            resultStream.on('error', (e) => {
                expect(e).toBe(expectedError)
                done()
            })
        })

        it('message count query error', (done) => {
            const expectedError = new Error('message-count-error')
            const storage = createMockStorage(createResultFactory({
                buckets: [MOCK_BUCKET],
                messageCounts: expectedError
            }))
            const resultStream = storage.requestLast(MOCK_STREAM_ID, 0, 1)
            resultStream.on('error', (e) => {
                expect(e).toBe(expectedError)
                done()
            })
        })

        it('message query error', (done) => {
            const expectedError = new Error('message-error')
            const storage = createMockStorage(createResultFactory({
                buckets: [MOCK_BUCKET],
                messageCounts: [MOCK_MESSAGE_COUNT],
                messages: expectedError
            }))
            const resultStream = storage.requestLast(MOCK_STREAM_ID, 0, 1)
            resultStream.on('error', (e) => {
                expect(e).toBe(expectedError)
                done()
            })
        })

    })

    describe.each([
        [REQUEST_TYPE_FROM, true],
        [REQUEST_TYPE_FROM, false],
        [REQUEST_TYPE_RANGE, true],
        [REQUEST_TYPE_RANGE, false],
    ])('%s, publisher: %p', (requestType: string, isPublisher: boolean) => {

        const getResultStream = (storage: Storage): Readable => {
            const publisherId: string|null = isPublisher ? 'mock-publisher-id' : null
            if (requestType === REQUEST_TYPE_FROM) {
                return storage.requestFrom(MOCK_STREAM_ID, 0, 0, 0, publisherId)
            } else if (requestType === REQUEST_TYPE_RANGE) {
                const msgChainId: string|null = isPublisher ? 'mock-msgchain-id' : null
                return storage.requestRange(MOCK_STREAM_ID, 0, 0, 0, 0, 0, publisherId, msgChainId)
            } else {
                throw new Error('Assertion failed')
            }
        }

        it('happy path', (done) => {
            const storage = createMockStorage(createResultFactory({
                buckets: [MOCK_BUCKET],
                messages: [MOCK_MESSAGE_1, MOCK_MESSAGE_2]
            }))
            const resultStream = getResultStream(storage)
            const receivedMessages: Protocol.StreamMessage[] = []
            resultStream.on('data', (message: Protocol.StreamMessage) => {
                receivedMessages.push(message)
            })
            resultStream.on('end', () => {
                expect(receivedMessages.length === 2)
                expect(receivedMessages[0].serialize()).toEqual(MOCK_MESSAGE_1.payload)
                expect(receivedMessages[1].serialize()).toEqual(MOCK_MESSAGE_2.payload)
                done()
            })
        })

        it('no messages', (done) => {
            const storage = createMockStorage(createResultFactory({
                buckets: [],
            }))
            const resultStream = getResultStream(storage)
            const onData = jest.fn()
            resultStream.on('data', onData)
            resultStream.on('end', () => {
                expect(onData).not.toBeCalled()
                done()
            })
        })

        it('bucket query error', (done) => {
            const expectedError = new Error('bucket-error')
            const storage = createMockStorage(createResultFactory({
                buckets: expectedError
            }))
            const resultStream = getResultStream(storage)
            resultStream.on('error', (e) => {
                expect(e).toBe(expectedError)
                done()
            })
        })

        it('message query error', (done) => {
            const expectedError = new Error('message-error')
            const storage = createMockStorage(createResultFactory({
                buckets: [MOCK_BUCKET],
                messages: expectedError
            }))
            const resultStream = getResultStream(storage)
            resultStream.on('error', (e) => {
                expect(e).toBe(expectedError)
                done()
            })
        })

    })

})
