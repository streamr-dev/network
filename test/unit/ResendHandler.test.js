const intoStream = require('into-stream')
const ResendHandler = require('../../src/logic/ResendHandler')
const { eventsToArray, wait } = require('../util')
const ResendLastRequest = require('../../src/messages/ResendLastRequest')
const ResendFromRequest = require('../../src/messages/ResendFromRequest')
const ResendRangeRequest = require('../../src/messages/ResendRangeRequest')
const { MessageID, MessageReference, StreamID } = require('../../src/identifiers')

describe('ResendHandler', () => {
    let storage
    let resendHandler

    beforeEach(async () => {
        storage = {}
        resendHandler = new ResendHandler(storage)
    })

    test('on receiving ResendLastRequest, storage#requestLast is invoked', async () => {
        storage.requestLast = jest.fn()
            .mockReturnValueOnce(intoStream.object([]))

        resendHandler.handleRequest(new ResendLastRequest(new StreamID('streamId', 0), 'subId', 10))

        expect(storage.requestLast.mock.calls).toEqual([
            ['streamId', 0, 10]
        ])
    })

    test('on receiving ResendFromRequest, storage#requestFrom is invoked', async () => {
        storage.requestFrom = jest.fn()
            .mockReturnValueOnce(intoStream.object([]))

        resendHandler.handleRequest(new ResendFromRequest(
            new StreamID('streamId', 0),
            'subId',
            new MessageReference(1555555555555, 0),
            'publisherId'
        ))

        expect(storage.requestFrom.mock.calls).toEqual([
            ['streamId', 0, 1555555555555, 0, 'publisherId']
        ])
    })

    test('on receiving ResendRangeRequest, storage#requestRange is invoked', async () => {
        storage.requestRange = jest.fn()
            .mockReturnValueOnce(intoStream.object([]))

        resendHandler.handleRequest(new ResendRangeRequest(
            new StreamID('streamId', 0),
            'subId',
            new MessageReference(1555555555555, 0),
            new MessageReference(1555555555555, 1000),
            'publisherId'
        ))

        expect(storage.requestRange.mock.calls).toEqual([
            ['streamId', 0, 1555555555555, 0, 1555555555555, 1000, 'publisherId']
        ])
    })

    // All three resend request types share the same response logic so we only test for one of them (ResendLastRequest).
    describe('after receiving resend request', () => {
        let events
        let doRequest

        beforeEach(() => {
            events = eventsToArray(resendHandler, Object.values(ResendHandler.events))
            doRequest = async () => {
                resendHandler.handleRequest(new ResendLastRequest(new StreamID('streamId', 0), 'subId', 10, 'source'))

                // Wait for 5 events
                for (let i = 0; i < 5; ++i) {
                    // eslint-disable-next-line no-await-in-loop
                    await wait(0)
                }
            }
        })

        test('if storage data is empty, emits NO_RESEND', async () => {
            storage.requestLast = jest.fn()
                .mockReturnValueOnce(intoStream.object([]))

            await doRequest()

            expect(events).toEqual([
                [
                    ResendHandler.events.NO_RESEND,
                    {
                        source: 'source',
                        streamId: new StreamID('streamId', 0),
                        subId: 'subId'
                    }
                ]
            ])
        })

        test('if storage data has data, emits RESENDING, UNICAST(s), and finally RESENT', async () => {
            storage.requestLast = jest.fn()
                .mockReturnValueOnce(intoStream.object([
                    {
                        timestamp: 2,
                        sequenceNo: 0,
                        publisherId: 'publisher1',
                        msgChainId: 'msgChainId',
                        previousTimestamp: 1,
                        previousSequenceNo: 999,
                        data: {
                            hello: 'world'
                        },
                        signature: 'signature',
                        signatureType: 1
                    },
                    {
                        timestamp: 515,
                        sequenceNo: 0,
                        publisherId: 'publisher2',
                        msgChainId: 'msgChainId',
                        data: {
                            hi: 'world'
                        },
                        signature: 'signature',
                        signatureType: 1
                    },
                    {
                        timestamp: 5005,
                        sequenceNo: 0,
                        publisherId: 'publisher3',
                        msgChainId: 'msgChainId',
                        data: {
                            yo: 'world'
                        },
                        signature: '',
                        signatureType: 2
                    },
                ]))

            await doRequest()

            expect(events).toEqual([
                [
                    ResendHandler.events.RESENDING,
                    {
                        source: 'source',
                        streamId: new StreamID('streamId', 0),
                        subId: 'subId'
                    }
                ],
                [
                    ResendHandler.events.UNICAST,
                    {
                        messageId: new MessageID(new StreamID('streamId', 0), 2, 0, 'publisher1', 'msgChainId'),
                        previousMessageReference: new MessageReference(1, 999),
                        data: {
                            hello: 'world'
                        },
                        signature: 'signature',
                        signatureType: 1,
                        subId: 'subId',
                        source: 'source'
                    }
                ],
                [
                    ResendHandler.events.UNICAST,
                    {
                        messageId: new MessageID(new StreamID('streamId', 0), 515, 0, 'publisher2', 'msgChainId'),
                        previousMessageReference: null,
                        data: {
                            hi: 'world'
                        },
                        signature: 'signature',
                        signatureType: 1,
                        subId: 'subId',
                        source: 'source'
                    }
                ],
                [
                    ResendHandler.events.UNICAST,
                    {
                        messageId: new MessageID(new StreamID('streamId', 0), 5005, 0, 'publisher3', 'msgChainId'),
                        previousMessageReference: null,
                        data: {
                            yo: 'world'
                        },
                        signature: '',
                        signatureType: 2,
                        subId: 'subId',
                        source: 'source'
                    }
                ],
                [
                    ResendHandler.events.RESENT,
                    {
                        source: 'source',
                        streamId: new StreamID('streamId', 0),
                        subId: 'subId'
                    }
                ],
            ])
        })
    })
})
