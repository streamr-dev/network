const { StreamMessage } = require('streamr-client-protocol').MessageLayer
const FieldDetector = require('../../../src/websocket/FieldDetector.js')

const STREAM_MESSAGE = StreamMessage.create(
    ['streamId', 0, 0, 0, 'publisherId', 'msgChainId'],
    null,
    StreamMessage.CONTENT_TYPES.MESSAGE,
    StreamMessage.ENCRYPTION_TYPES.NONE,
    {
        aString: 'hello',
        aNumber: 412,
        aBoolean: true,
        aList: [1, 2, 3],
        anObject: {}
    },
    StreamMessage.SIGNATURE_TYPES.NONE,
    null
)

describe('FieldDetector#detectAndSetFields', () => {
    let streamFetcher
    let fieldDetector

    beforeEach(() => {
        streamFetcher = {
            setFields: jest.fn()
        }
        fieldDetector = new FieldDetector(streamFetcher)
    })

    test('does not set fields if stream.autoConfigure = false', async () => {
        const stream = {
            id: 'id'
        }

        await fieldDetector.detectAndSetFields(stream, STREAM_MESSAGE, 'apiKey', 'sessionToken')

        expect(streamFetcher.setFields).not.toHaveBeenCalled()
    })

    test('does not set fields if stream.autoConfigure = true but fields are already configured', async () => {
        const stream = {
            id: 'id',
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

        await fieldDetector.detectAndSetFields(stream, STREAM_MESSAGE, 'apiKey', 'sessionToken')

        expect(streamFetcher.setFields).not.toHaveBeenCalled()
    })

    test('sets fields if stream.autoConfigure = true and fields have not been configured yet', async () => {
        const stream = {
            id: 'id',
            autoConfigure: true
        }

        await fieldDetector.detectAndSetFields(stream, STREAM_MESSAGE, 'apiKey', 'sessionToken')

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
        const stream = {
            id: 'id',
            autoConfigure: true
        }

        await fieldDetector.detectAndSetFields(stream, STREAM_MESSAGE, 'apiKey', 'sessionToken')
        await fieldDetector.detectAndSetFields(stream, STREAM_MESSAGE, 'apiKey', 'sessionToken')
        await fieldDetector.detectAndSetFields(stream, STREAM_MESSAGE, 'apiKey', 'sessionToken')

        expect(streamFetcher.setFields).toHaveBeenCalledTimes(1)
    })

    test('if streamFetcher#setFields throws error can try to set fields again', async () => {
        streamFetcher.setFields
            .mockRejectedValueOnce(new Error('error #1'))
            .mockRejectedValueOnce(new Error('error #2'))
        const stream = {
            streamId: 'id',
            autoConfigure: true
        }

        try {
            await fieldDetector.detectAndSetFields(stream, STREAM_MESSAGE, 'apiKey', 'sessionToken')
        } catch (e) {
            // no op
        }
        try {
            await fieldDetector.detectAndSetFields(stream, STREAM_MESSAGE, 'apiKey', 'sessionToken')
        } catch (e) {
            // no op
        }
        await fieldDetector.detectAndSetFields(stream, STREAM_MESSAGE, 'apiKey', 'sessionToken')

        expect(streamFetcher.setFields).toHaveBeenCalledTimes(3)
    })
})
