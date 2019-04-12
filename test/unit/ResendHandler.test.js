const { Readable } = require('stream')
const intoStream = require('into-stream')
const ResendHandler = require('../../src/logic/ResendHandler')
const ResendLastRequest = require('../../src/messages/ResendLastRequest')
const { MessageID, MessageReference, StreamID } = require('../../src/identifiers')
const ResendResponseNoResend = require('../../src/messages/ResendResponseNoResend')
const ResendResponseResent = require('../../src/messages/ResendResponseResent')
const ResendResponseResending = require('../../src/messages/ResendResponseResending')
const UnicastMessage = require('../../src/messages/UnicastMessage')

describe('ResendHandler', () => {
    let resendHandler
    let request
    let cbInvocations
    let sendResponse
    let sendUnicast
    let notifyError

    beforeEach(() => {
        request = new ResendLastRequest(new StreamID('streamId', 0), 'subId', 10, 'source')
        cbInvocations = []
        sendResponse = (source, response) => cbInvocations.push(['sendResponse', response.constructor.name])
        sendUnicast = (source, unicast) => cbInvocations.push(['sendUnicast', unicast.constructor.name])
        notifyError = (req, error) => cbInvocations.push(['notifyError', error])
    })

    describe('initialized with no strategies', () => {
        beforeEach(() => {
            resendHandler = new ResendHandler([], sendResponse, sendUnicast, notifyError)
        })

        test('handleRequest(request) returns false', async () => {
            const isFulfilled = await resendHandler.handleRequest(request)
            expect(isFulfilled).toEqual(false)
        })

        test('handleRequest(request) sends only NoResend', async () => {
            await resendHandler.handleRequest(request)
            expect(cbInvocations).toEqual([
                ['sendResponse', ResendResponseNoResend.name]
            ])
        })
    })

    describe('initialized with strategy that returns empty stream', () => {
        beforeEach(() => {
            resendHandler = new ResendHandler([{
                getResendResponseStream: () => intoStream.object([])
            }], sendResponse, sendUnicast, notifyError)
        })

        test('handleRequest(request) returns false', async () => {
            const isFulfilled = await resendHandler.handleRequest(request)
            expect(isFulfilled).toEqual(false)
        })

        test('handleRequest(request) sends only NoResend', async () => {
            await resendHandler.handleRequest(request)
            expect(cbInvocations).toEqual([
                ['sendResponse', ResendResponseNoResend.name]
            ])
        })
    })

    describe('initialized with strategy that returns stream that immediately errors', () => {
        beforeEach(() => {
            resendHandler = new ResendHandler([{
                getResendResponseStream: () => intoStream.object(Promise.reject(new Error('yikes')))
            }], sendResponse, sendUnicast, notifyError)
        })

        test('handleRequest(request) returns false', async () => {
            const isFulfilled = await resendHandler.handleRequest(request)
            expect(isFulfilled).toEqual(false)
        })

        test('handleRequest(request) sends Error and NoResend', async () => {
            await resendHandler.handleRequest(request)
            expect(cbInvocations).toEqual([
                ['notifyError', new Error('yikes')],
                ['sendResponse', ResendResponseNoResend.name]
            ])
        })
    })

    describe('initialized with strategy that returns stream with 2 messages', () => {
        beforeEach(() => {
            resendHandler = new ResendHandler([{
                getResendResponseStream: () => intoStream.object([
                    new UnicastMessage(
                        new MessageID(new StreamID('streamId', 0), 1000, 0, 'publisherId', 'msgChainId'),
                        null,
                        {},
                        null,
                        null,
                        'subId'
                    ),
                    new UnicastMessage(
                        new MessageID(new StreamID('streamId', 0), 2000, 0, 'publisherId', 'msgChainId'),
                        null,
                        {},
                        null,
                        null,
                        'subId'
                    )
                ])
            }], sendResponse, sendUnicast, notifyError)
        })

        test('handleRequest(request) returns true', async () => {
            const isFulfilled = await resendHandler.handleRequest(request)
            expect(isFulfilled).toEqual(true)
        })

        test('handleRequest(request) sends Resending, 2 x Unicast, and then Resent', async () => {
            await resendHandler.handleRequest(request)
            expect(cbInvocations).toEqual([
                ['sendResponse', ResendResponseResending.name],
                ['sendUnicast', UnicastMessage.name],
                ['sendUnicast', UnicastMessage.name],
                ['sendResponse', ResendResponseResent.name]
            ])
        })
    })

    describe('initialized with strategy that returns stream with 2 messages but then errors', () => {
        beforeEach(() => {
            resendHandler = new ResendHandler([{
                getResendResponseStream: () => {
                    const stream = new Readable({
                        objectMode: true,
                        read() {}
                    })

                    setImmediate(() => stream.push(new UnicastMessage(
                        new MessageID(new StreamID('streamId', 0), 1000, 0, 'publisherId', 'msgChainId'),
                        null,
                        {},
                        null,
                        null,
                        'subId'
                    )))
                    setImmediate(() => stream.push(new UnicastMessage(
                        new MessageID(new StreamID('streamId', 0), 2000, 0, 'publisherId', 'msgChainId'),
                        null,
                        {},
                        null,
                        null,
                        'subId'
                    )))
                    setImmediate(() => {
                        stream.emit('error', new Error('yikes'))
                    })

                    return stream
                }
            }], sendResponse, sendUnicast, notifyError)
        })

        test('handleRequest(request) returns false', async () => {
            const isFulfilled = await resendHandler.handleRequest(request)
            expect(isFulfilled).toEqual(false)
        })

        test('handleRequest(request) sends Resending, 2 x Unicast, Error, and then NoResend', async () => {
            await resendHandler.handleRequest(request)
            expect(cbInvocations).toEqual([
                ['sendResponse', ResendResponseResending.name],
                ['sendUnicast', UnicastMessage.name],
                ['sendUnicast', UnicastMessage.name],
                ['notifyError', new Error('yikes')],
                ['sendResponse', ResendResponseNoResend.name]
            ])
        })
    })

    describe('initialized with 1st strategy empty, 2nd erroring, and 3rd fulfilling', () => {
        beforeEach(() => {
            const firstStrategy = {
                getResendResponseStream: () => intoStream.object([])
            }

            const secondStrategy = {
                getResendResponseStream: () => {
                    const stream = new Readable({
                        objectMode: true,
                        read() {}
                    })
                    setImmediate(() => stream.push(new UnicastMessage(
                        new MessageID(new StreamID('streamId', 0), 2000, 0, 'publisherId', 'msgChainId'),
                        null,
                        {},
                        null,
                        null,
                        'subId'
                    )))
                    setImmediate(() => {
                        stream.emit('error', new Error('yikes'))
                    })
                    return stream
                }
            }

            const thirdStrategy = {
                getResendResponseStream: () => intoStream.object([
                    new UnicastMessage(
                        new MessageID(new StreamID('streamId', 0), 1000, 0, 'publisherId', 'msgChainId'),
                        null,
                        {},
                        null,
                        null,
                        'subId'
                    ),
                    new UnicastMessage(
                        new MessageID(new StreamID('streamId', 0), 2000, 0, 'publisherId', 'msgChainId'),
                        null,
                        {},
                        null,
                        null,
                        'subId'
                    )
                ])
            }

            resendHandler = new ResendHandler([firstStrategy, secondStrategy, thirdStrategy],
                sendResponse, sendUnicast, notifyError)
        })

        test('handleRequest(request) returns true', async () => {
            const isFulfilled = await resendHandler.handleRequest(request)
            expect(isFulfilled).toEqual(true)
        })

        test('handleRequest(request) sends expected order of messages', async () => {
            await resendHandler.handleRequest(request)
            expect(cbInvocations).toEqual([
                ['sendResponse', ResendResponseResending.name],
                ['sendUnicast', UnicastMessage.name],
                ['notifyError', new Error('yikes')],
                ['sendResponse', ResendResponseResending.name],
                ['sendUnicast', UnicastMessage.name],
                ['sendUnicast', UnicastMessage.name],
                ['sendResponse', ResendResponseResent.name]
            ])
        })
    })

    describe('initialized with 1st and 2nd strategy both fulfilling', () => {
        let neverShouldBeInvokedFn
        beforeEach(() => {
            neverShouldBeInvokedFn = jest.fn()

            const firstStrategy = {
                getResendResponseStream: () => intoStream.object([
                    {
                        timestamp: 1000,
                        sequenceNo: 0,
                        publisherId: 'publisher',
                        msgChainId: 'msgChain',
                        data: {}
                    }
                ])
            }

            const secondStrategy = {
                getResendResponseStream: neverShouldBeInvokedFn
            }

            resendHandler = new ResendHandler([firstStrategy, secondStrategy], sendResponse, sendUnicast, notifyError)
        })

        test('on handleRequest(request) 2nd strategy is never used (short-circuit)', async () => {
            const fulfilled = await resendHandler.handleRequest(request)
            expect(fulfilled).toEqual(true)
            expect(neverShouldBeInvokedFn).not.toHaveBeenCalled()
        })
    })

    describe('callback arguments are formed correctly', () => {
        beforeEach(() => {
            sendResponse = jest.fn()
            sendUnicast = jest.fn()
            notifyError = jest.fn()
        })

        test('sendResponse with ResendResponseNoResend is formed correctly', async () => {
            resendHandler = new ResendHandler([{
                getResendResponseStream: () => intoStream.object([])
            }], sendResponse, sendUnicast, notifyError)

            await resendHandler.handleRequest(request)

            expect(sendResponse).toBeCalledWith('source',
                new ResendResponseNoResend(new StreamID('streamId', 0), 'subId'))
        })

        test('notifyError is formed correctly', async () => {
            resendHandler = new ResendHandler([{
                getResendResponseStream: () => intoStream.object(Promise.reject(new Error('yikes')))
            }], sendResponse, sendUnicast, notifyError)

            await resendHandler.handleRequest(request)

            expect(notifyError).toBeCalledWith(request, new Error('yikes'))
        })

        describe('with data available', () => {
            beforeEach(() => {
                resendHandler = new ResendHandler([{
                    getResendResponseStream: () => intoStream.object([
                        new UnicastMessage(
                            new MessageID(new StreamID('streamId', 0), 756, 0, 'publisherId', 'msgChainId'),
                            new MessageReference(666, 50),
                            {
                                hello: 'world'
                            },
                            'signature',
                            2,
                            'subId'
                        )
                    ])
                }], sendResponse, sendUnicast, notifyError)
            })

            test('sendResponse with ResendResponseResending is formed correctly', async () => {
                await resendHandler.handleRequest(request)

                expect(sendResponse).toBeCalledWith('source',
                    new ResendResponseResending(new StreamID('streamId', 0), 'subId'))
            })

            test('sendResponse with ResendResponseResending is formed correctly', async () => {
                await resendHandler.handleRequest(request)

                expect(sendResponse).toBeCalledWith('source',
                    new ResendResponseResent(new StreamID('streamId', 0), 'subId'))
            })

            test('sendUnicast is formed correctly', async () => {
                await resendHandler.handleRequest(request)

                expect(sendUnicast).toBeCalledWith('source', new UnicastMessage(
                    new MessageID(new StreamID('streamId', 0), 756, 0, 'publisherId', 'msgChainId'),
                    new MessageReference(666, 50),
                    {
                        hello: 'world'
                    },
                    'signature',
                    2,
                    'subId'
                ))
            })
        })
    })
})
