const { Readable } = require('stream')
const { MessageLayer, ControlLayer } = require('streamr-client-protocol')
const intoStream = require('into-stream')
const ResendHandler = require('../../src/logic/ResendHandler')
const { waitForStreamToEnd } = require('../util')

const { StreamMessage } = MessageLayer

describe('ResendHandler', () => {
    let resendHandler
    let request
    let cbInvocations
    let sendResponse
    let sendUnicast
    let notifyError

    beforeEach(() => {
        request = ControlLayer.ResendLastRequest.create('streamId', 0, 'subId', 10)
        cbInvocations = []
        sendResponse = (source, response) => cbInvocations.push(['sendResponse', response.constructor.name])
        sendUnicast = (source, unicast) => cbInvocations.push(['sendUnicast', unicast.constructor.name])
        notifyError = (req, error) => cbInvocations.push(['notifyError', error])
    })

    describe('initialized with no strategies', () => {
        beforeEach(() => {
            resendHandler = new ResendHandler([], sendResponse, sendUnicast, notifyError)
        })

        test('handleRequest(request) returns empty empty', async () => {
            const streamAsArray = await waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))
            expect(streamAsArray).toEqual([])
        })

        test('handleRequest(request) marks fulfilled = false', async () => {
            const stream = resendHandler.handleRequest(request, 'source')
            await waitForStreamToEnd(stream)
            expect(stream.fulfilled).toStrictEqual(false)
        })

        test('handleRequest(request) sends only NoResend', async () => {
            await waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))
            expect(cbInvocations).toEqual([
                ['sendResponse', ControlLayer.ResendResponseNoResendV1.name]
            ])
        })
    })

    describe('initialized with strategy that returns empty stream', () => {
        beforeEach(() => {
            resendHandler = new ResendHandler([{
                getResendResponseStream: () => intoStream.object([])
            }], sendResponse, sendUnicast, notifyError)
        })

        test('handleRequest(request) returns empty stream', async () => {
            const streamAsArray = await waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))
            expect(streamAsArray).toEqual([])
        })

        test('handleRequest(request) marks fulfilled = false', async () => {
            const stream = resendHandler.handleRequest(request, 'source')
            await waitForStreamToEnd(stream)
            expect(stream.fulfilled).toStrictEqual(false)
        })

        test('handleRequest(request) sends only NoResend', async () => {
            await waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))
            expect(cbInvocations).toEqual([
                ['sendResponse', ControlLayer.ResendResponseNoResendV1.name]
            ])
        })
    })

    describe('initialized with strategy that returns stream that immediately errors', () => {
        beforeEach(() => {
            resendHandler = new ResendHandler([{
                getResendResponseStream: () => intoStream.object(Promise.reject(new Error('yikes')))
            }], sendResponse, sendUnicast, notifyError)
        })

        test('handleRequest(request) returns empty stream', async () => {
            const streamAsArray = await waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))
            expect(streamAsArray).toEqual([])
        })

        test('handleRequest(request) marks fulfilled = false', async () => {
            const stream = resendHandler.handleRequest(request, 'source')
            await waitForStreamToEnd(stream)
            expect(stream.fulfilled).toStrictEqual(false)
        })

        test('handleRequest(request) sends Error and NoResend', async () => {
            await waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))
            expect(cbInvocations).toEqual([
                ['notifyError', new Error('yikes')],
                ['sendResponse', ControlLayer.ResendResponseNoResendV1.name]
            ])
        })
    })

    describe('initialized with strategy that returns stream with 2 messages', () => {
        beforeEach(() => {
            resendHandler = new ResendHandler([{
                getResendResponseStream: () => intoStream.object([
                    [ControlLayer.UnicastMessage.create(
                        'subId', StreamMessage.create(
                            ['streamId', 0, 1000, 0, 'publisherId', 'msgChainId'], null, StreamMessage.CONTENT_TYPES.JSON,
                            {}, StreamMessage.SIGNATURE_TYPES.NONE, null
                        )
                    ), null],
                    [ControlLayer.UnicastMessage.create(
                        'subId', StreamMessage.create(
                            ['streamId', 0, 2000, 0, 'publisherId', 'msgChainId'], null, StreamMessage.CONTENT_TYPES.JSON,
                            {}, StreamMessage.SIGNATURE_TYPES.NONE, null
                        )
                    ), null],
                ])
            }], sendResponse, sendUnicast, notifyError)
        })

        test('handleRequest(request) returns stream with 2 messages', async () => {
            const streamAsArray = await waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))
            expect(streamAsArray).toHaveLength(2)
        })

        test('handleRequest(request) marks fulfilled = true', async () => {
            const stream = resendHandler.handleRequest(request, 'source')
            await waitForStreamToEnd(stream)
            expect(stream.fulfilled).toStrictEqual(true)
        })

        test('handleRequest(request) sends Resending, 2 x Unicast, and then Resent', async () => {
            await waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))
            expect(cbInvocations).toEqual([
                ['sendResponse', ControlLayer.ResendResponseResendingV1.name],
                ['sendUnicast', ControlLayer.UnicastMessageV1.name],
                ['sendUnicast', ControlLayer.UnicastMessageV1.name],
                ['sendResponse', ControlLayer.ResendResponseResentV1.name]
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

                    setImmediate(() => stream.push(
                        [ControlLayer.UnicastMessage.create(
                            'subId', StreamMessage.create(
                                ['streamId', 0, 1000, 0, 'publisherId', 'msgChainId'], null, StreamMessage.CONTENT_TYPES.JSON,
                                {}, StreamMessage.SIGNATURE_TYPES.NONE, null
                            )
                        ), null]
                    ))
                    setImmediate(() => stream.push(
                        [ControlLayer.UnicastMessage.create(
                            'subId', StreamMessage.create(
                                ['streamId', 0, 2000, 0, 'publisherId', 'msgChainId'], null, StreamMessage.CONTENT_TYPES.JSON,
                                {}, StreamMessage.SIGNATURE_TYPES.NONE, null
                            )
                        ), null]
                    ))
                    setImmediate(() => {
                        stream.emit('error', new Error('yikes'))
                    })

                    return stream
                }
            }], sendResponse, sendUnicast, notifyError)
        })

        test('handleRequest(request) returns stream with 2 messages', async () => {
            const streamAsArray = await waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))
            expect(streamAsArray).toHaveLength(2)
        })

        test('handleRequest(request) marks fulfilled = false', async () => {
            const stream = resendHandler.handleRequest(request)
            await waitForStreamToEnd(stream)
            expect(stream.fulfilled).toStrictEqual(false)
        })

        test('handleRequest(request) sends Resending, 2 x Unicast, Error, and then NoResend', async () => {
            await waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))
            expect(cbInvocations).toEqual([
                ['sendResponse', ControlLayer.ResendResponseResendingV1.name],
                ['sendUnicast', ControlLayer.UnicastMessageV1.name],
                ['sendUnicast', ControlLayer.UnicastMessageV1.name],
                ['notifyError', new Error('yikes')],
                ['sendResponse', ControlLayer.ResendResponseNoResendV1.name]
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
                    setImmediate(() => stream.push(
                        [ControlLayer.UnicastMessage.create(
                            'subId', StreamMessage.create(
                                ['streamId', 0, 2000, 0, 'publisherId', 'msgChainId'], null, StreamMessage.CONTENT_TYPES.JSON,
                                {}, StreamMessage.SIGNATURE_TYPES.NONE, null
                            )
                        ), null]
                    ))
                    setImmediate(() => {
                        stream.emit('error', new Error('yikes'))
                    })
                    return stream
                }
            }

            const thirdStrategy = {
                getResendResponseStream: () => intoStream.object([
                    [ControlLayer.UnicastMessage.create(
                        'subId', StreamMessage.create(
                            ['streamId', 0, 1000, 0, 'publisherId', 'msgChainId'], null, StreamMessage.CONTENT_TYPES.JSON,
                            {}, StreamMessage.SIGNATURE_TYPES.NONE, null
                        )
                    ), null],
                    [ControlLayer.UnicastMessage.create(
                        'subId', StreamMessage.create(
                            ['streamId', 0, 1000, 0, 'publisherId', 'msgChainId'], null, StreamMessage.CONTENT_TYPES.JSON,
                            {}, StreamMessage.SIGNATURE_TYPES.NONE, null
                        )
                    ), null],
                ])
            }

            resendHandler = new ResendHandler([firstStrategy, secondStrategy, thirdStrategy],
                sendResponse, sendUnicast, notifyError)
        })

        test('handleRequest(request) returns stream with expected messages', async () => {
            const streamAsArray = await waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))
            expect(streamAsArray).toHaveLength(3)
        })

        test('handleRequest(request) sends expected order of messages', async () => {
            await waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))
            expect(cbInvocations).toEqual([
                ['sendResponse', ControlLayer.ResendResponseResendingV1.name],
                ['sendUnicast', ControlLayer.UnicastMessageV1.name],
                ['notifyError', new Error('yikes')],
                ['sendResponse', ControlLayer.ResendResponseResendingV1.name],
                ['sendUnicast', ControlLayer.UnicastMessageV1.name],
                ['sendUnicast', ControlLayer.UnicastMessageV1.name],
                ['sendResponse', ControlLayer.ResendResponseResentV1.name]
            ])
        })
    })

    describe('initialized with 1st and 2nd strategy both fulfilling', () => {
        let neverShouldBeInvokedFn
        beforeEach(() => {
            neverShouldBeInvokedFn = jest.fn()

            const firstStrategy = {
                getResendResponseStream: () => intoStream.object([
                    [ControlLayer.UnicastMessage.create(
                        'subId', StreamMessage.create(
                            ['streamId', 0, 1000, 0, 'publisher', 'msgChain'], null, StreamMessage.CONTENT_TYPES.JSON,
                            {}, StreamMessage.SIGNATURE_TYPES.NONE, null
                        )
                    ), null]
                ])
            }

            const secondStrategy = {
                getResendResponseStream: neverShouldBeInvokedFn
            }

            resendHandler = new ResendHandler([firstStrategy, secondStrategy], sendResponse, sendUnicast, notifyError)
        })

        test('on handleRequest(request) 2nd strategy is never used (short-circuit)', async () => {
            const stream = resendHandler.handleRequest(request, 'source')
            await waitForStreamToEnd(stream)
            expect(stream.fulfilled).toStrictEqual(true)
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

            await waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))

            expect(sendResponse).toBeCalledWith('source',
                ControlLayer.ResendResponseNoResend.create('streamId', 0, 'subId'))
        })

        test('notifyError is formed correctly', async () => {
            resendHandler = new ResendHandler([{
                getResendResponseStream: () => intoStream.object(Promise.reject(new Error('yikes')))
            }], sendResponse, sendUnicast, notifyError)

            await waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))

            expect(notifyError).toBeCalledWith(request, new Error('yikes'))
        })

        describe('with data available', () => {
            beforeEach(() => {
                resendHandler = new ResendHandler([{
                    getResendResponseStream: () => intoStream.object([
                        [ControlLayer.UnicastMessage.create(
                            'subId', StreamMessage.create(
                                ['streamId', 0, 756, 0, 'publisherId', 'msgChainId'], [666, 50],
                                StreamMessage.CONTENT_TYPES.JSON, {
                                    hello: 'world'
                                }, StreamMessage.SIGNATURE_TYPES.ETH, 'signature'
                            )
                        ), null]
                    ])
                }], sendResponse, sendUnicast, notifyError)
            })

            test('sendResponse with ResendResponseResending is formed correctly', async () => {
                await waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))

                expect(sendResponse).toBeCalledWith('source',
                    ControlLayer.ResendResponseResending.create('streamId', 0, 'subId'))
            })

            test('sendResponse with ResendResponseResending is formed correctly', async () => {
                await waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))

                expect(sendResponse).toBeCalledWith('source',
                    ControlLayer.ResendResponseResent.create('streamId', 0, 'subId'))
            })

            test('sendUnicast is formed correctly', async () => {
                await waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))

                expect(sendUnicast).toBeCalledWith('source', ControlLayer.UnicastMessage.create(
                    'subId', StreamMessage.create(
                        ['streamId', 0, 756, 0, 'publisherId', 'msgChainId'], [666, 50],
                        StreamMessage.CONTENT_TYPES.JSON, {
                            hello: 'world'
                        }, StreamMessage.SIGNATURE_TYPES.ETH, 'signature'
                    )
                ), null)
            })
        })
    })
})
