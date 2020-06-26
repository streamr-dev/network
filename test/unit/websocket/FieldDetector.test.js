const { StreamMessage, MessageID } = require('streamr-network').Protocol.MessageLayer

const HttpError = require('../../../src/errors/HttpError')
const FieldDetector = require('../../../src/websocket/FieldDetector')

const STREAM_MESSAGE = new StreamMessage({
    messageId: new MessageID('streamId', 0, 0, 0, 'publisherId', 'msgChainId'),
    content: {
        aString: 'hello',
        aNumber: 412,
        aBoolean: true,
        aList: [1, 2, 3],
        anObject: {}
    },
})

describe('FieldDetector#detectAndSetFields', () => {
    let stream
    let streamFetcher
    let fieldDetector

    beforeEach(() => {
        stream = {
            id: 'id',
        }

        streamFetcher = {
            fetch: jest.fn().mockImplementation(() => Promise.resolve(stream)),
            setFields: jest.fn(),
        }
        fieldDetector = new FieldDetector(streamFetcher)
    })

    test('does not set fields if stream.autoConfigure = false', async () => {
        stream = {
            ...stream,
            autoConfigure: false,
        }

        await fieldDetector.detectAndSetFields(STREAM_MESSAGE, 'apiKey', 'sessionToken')
        expect(streamFetcher.setFields).not.toHaveBeenCalled()
    })

    test('does not set fields if stream.autoConfigure = true but fields are already configured', async () => {
        stream = {
            ...stream,
            autoConfigure: true,
            config: {
                fields: [
                    {
                        name: 'aaa',
                        type: 'string'
                    }
                ]
            }
        }

        await fieldDetector.detectAndSetFields(STREAM_MESSAGE, 'apiKey', 'sessionToken')
        expect(streamFetcher.setFields).not.toHaveBeenCalled()
    })

    test('sets fields if stream.autoConfigure = true and fields have not been configured yet', async () => {
        stream = {
            ...stream,
            autoConfigure: true
        }

        await fieldDetector.detectAndSetFields(STREAM_MESSAGE, 'apiKey', 'sessionToken')

        expect(streamFetcher.setFields).toHaveBeenCalledTimes(1)
        expect(streamFetcher.setFields).toHaveBeenCalledWith(
            'id',
            [
                {
                    name: 'aString',
                    type: 'string',
                },
                {
                    name: 'aNumber',
                    type: 'number',
                },
                {
                    name: 'aBoolean',
                    type: 'boolean',
                },
                {
                    name: 'aList',
                    type: 'list',
                },
                {
                    name: 'anObject',
                    type: 'map',
                },
            ],
            'apiKey',
            'sessionToken'
        )
    })

    test('does not re-set fields of same stream on multiple invocations', async () => {
        stream = {
            ...stream,
            autoConfigure: true
        }

        await fieldDetector.detectAndSetFields(STREAM_MESSAGE, 'apiKey', 'sessionToken')
        await fieldDetector.detectAndSetFields(STREAM_MESSAGE, 'apiKey', 'sessionToken')
        await fieldDetector.detectAndSetFields(STREAM_MESSAGE, 'apiKey', 'sessionToken')

        expect(streamFetcher.setFields).toHaveBeenCalledTimes(1)
    })

    test('if streamFetcher#fetch throws a 403, do not try again', async () => {
        streamFetcher.fetch.mockRejectedValue(new HttpError(403, 'method', 'url'))
        stream = {
            ...stream,
            autoConfigure: true
        }

        try {
            await fieldDetector.detectAndSetFields(STREAM_MESSAGE, 'apiKey', 'sessionToken')
        } catch (e) {
            // no op
        }
        try {
            await fieldDetector.detectAndSetFields(STREAM_MESSAGE, 'apiKey', 'sessionToken')
        } catch (e) {
            // no op
        }

        expect(streamFetcher.fetch).toHaveBeenCalledTimes(1)
        expect(streamFetcher.setFields).toHaveBeenCalledTimes(0)
    })

    test('if streamFetcher#setFields throws a 403, do not try again', async () => {
        streamFetcher.setFields.mockRejectedValue(new HttpError(403, 'method', 'url'))
        stream = {
            ...stream,
            autoConfigure: true
        }

        try {
            await fieldDetector.detectAndSetFields(STREAM_MESSAGE, 'apiKey', 'sessionToken')
        } catch (e) {
            // no op
        }
        try {
            await fieldDetector.detectAndSetFields(STREAM_MESSAGE, 'apiKey', 'sessionToken')
        } catch (e) {
            // no op
        }

        expect(streamFetcher.setFields).toHaveBeenCalledTimes(1)
    })

    test('if streamFetcher#setFields throws error can try to set fields again', async () => {
        streamFetcher.setFields
            .mockRejectedValueOnce(new Error('error #1'))
            .mockRejectedValueOnce(new Error('error #2'))
        stream = {
            ...stream,
            autoConfigure: true
        }

        try {
            await fieldDetector.detectAndSetFields(STREAM_MESSAGE, 'apiKey', 'sessionToken')
        } catch (e) {
            // no op
        }
        try {
            await fieldDetector.detectAndSetFields(STREAM_MESSAGE, 'apiKey', 'sessionToken')
        } catch (e) {
            // no op
        }
        await fieldDetector.detectAndSetFields(STREAM_MESSAGE, 'apiKey', 'sessionToken')

        expect(streamFetcher.setFields).toHaveBeenCalledTimes(3)
    })
})
