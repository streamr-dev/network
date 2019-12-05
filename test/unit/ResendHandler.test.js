const { Readable } = require('stream')

const { MessageLayer, ControlLayer } = require('streamr-client-protocol')
const intoStream = require('into-stream')
const { waitForStreamToEnd } = require('streamr-test-utils')

const ResendHandler = require('../../src/logic/ResendHandler')

const { StreamMessage } = MessageLayer

describe('ResendHandler', () => {
    let resendHandler
    let request
    let notifyError

    beforeEach(() => {
        request = ControlLayer.ResendLastRequest.create('streamId', 0, 'requestId', 10)
        notifyError = jest.fn()
    })

    describe('initialized with no strategies', () => {
        beforeEach(() => {
            resendHandler = new ResendHandler([], notifyError)
        })

        test('handleRequest(request) returns empty empty', async () => {
            const streamAsArray = await waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))
            expect(streamAsArray).toEqual([])
        })
    })

    describe('initialized with strategy that returns empty stream', () => {
        beforeEach(() => {
            resendHandler = new ResendHandler([{
                getResendResponseStream: () => intoStream.object([])
            }], notifyError)
        })

        test('handleRequest(request) returns empty stream', async () => {
            const streamAsArray = await waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))
            expect(streamAsArray).toEqual([])
        })
    })

    describe('initialized with strategy that returns stream that immediately errors', () => {
        beforeEach(() => {
            resendHandler = new ResendHandler([{
                getResendResponseStream: () => intoStream.object(Promise.reject(new Error('yikes')))
            }], notifyError)
        })

        test('handleRequest(request) returns empty stream', async () => {
            const streamAsArray = await waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))
            expect(streamAsArray).toEqual([])
        })

        test('handleRequest(request) invokes notifyError', async () => {
            await waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))
            expect(notifyError).toHaveBeenCalledTimes(1)
        })
    })

    describe('initialized with strategy that returns stream with 2 messages', () => {
        beforeEach(() => {
            resendHandler = new ResendHandler([{
                getResendResponseStream: () => intoStream.object([
                    ControlLayer.UnicastMessage.create(
                        'requestId', StreamMessage.create(
                            ['streamId', 0, 1000, 0, 'publisherId', 'msgChainId'],
                            null,
                            StreamMessage.CONTENT_TYPES.MESSAGE,
                            StreamMessage.ENCRYPTION_TYPES.NONE,
                            {},
                            StreamMessage.SIGNATURE_TYPES.NONE,
                            null
                        )
                    ),
                    ControlLayer.UnicastMessage.create(
                        'requestId', StreamMessage.create(
                            ['streamId', 0, 2000, 0, 'publisherId', 'msgChainId'],
                            null,
                            StreamMessage.CONTENT_TYPES.MESSAGE,
                            StreamMessage.ENCRYPTION_TYPES.NONE,
                            {},
                            StreamMessage.SIGNATURE_TYPES.NONE,
                            null
                        )
                    ),
                ])
            }], notifyError)
        })

        test('handleRequest(request) returns stream with 2 messages', async () => {
            const streamAsArray = await waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))
            expect(streamAsArray).toHaveLength(2)
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
                        ControlLayer.UnicastMessage.create(
                            'requestId', StreamMessage.create(
                                ['streamId', 0, 1000, 0, 'publisherId', 'msgChainId'],
                                null,
                                StreamMessage.CONTENT_TYPES.MESSAGE,
                                StreamMessage.ENCRYPTION_TYPES.NONE,
                                {},
                                StreamMessage.SIGNATURE_TYPES.NONE,
                                null
                            )
                        ),
                    ))
                    setImmediate(() => stream.push(
                        ControlLayer.UnicastMessage.create(
                            'requestId', StreamMessage.create(
                                ['streamId', 0, 2000, 0, 'publisherId', 'msgChainId'],
                                null,
                                StreamMessage.CONTENT_TYPES.MESSAGE,
                                StreamMessage.ENCRYPTION_TYPES.NONE,
                                {},
                                StreamMessage.SIGNATURE_TYPES.NONE,
                                null
                            )
                        )
                    ))
                    setImmediate(() => {
                        stream.emit('error', new Error('yikes'))
                    })

                    return stream
                }
            }], notifyError)
        })

        test('handleRequest(request) returns stream with 2 UnicastMessages', async () => {
            const streamAsArray = await waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))
            expect(streamAsArray).toHaveLength(2)
        })

        test('handleRequest(request) invokes notifyError', async () => {
            await waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))
            expect(notifyError).toHaveBeenCalledTimes(1)
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
                        ControlLayer.UnicastMessage.create(
                            'requestId', StreamMessage.create(
                                ['streamId', 0, 2000, 0, 'publisherId', 'msgChainId'],
                                null,
                                StreamMessage.CONTENT_TYPES.MESSAGE,
                                StreamMessage.ENCRYPTION_TYPES.NONE,
                                {},
                                StreamMessage.SIGNATURE_TYPES.NONE,
                                null
                            )
                        )
                    ))
                    setImmediate(() => {
                        stream.emit('error', new Error('yikes'))
                    })
                    return stream
                }
            }

            const thirdStrategy = {
                getResendResponseStream: () => intoStream.object([
                    ControlLayer.UnicastMessage.create(
                        'requestId', StreamMessage.create(
                            ['streamId', 0, 1000, 0, 'publisherId', 'msgChainId'],
                            null,
                            StreamMessage.CONTENT_TYPES.MESSAGE,
                            StreamMessage.ENCRYPTION_TYPES.NONE,
                            {},
                            StreamMessage.SIGNATURE_TYPES.NONE,
                            null
                        )
                    ),
                    ControlLayer.UnicastMessage.create(
                        'requestId', StreamMessage.create(
                            ['streamId', 0, 1000, 0, 'publisherId', 'msgChainId'],
                            null,
                            StreamMessage.CONTENT_TYPES.MESSAGE,
                            StreamMessage.ENCRYPTION_TYPES.NONE,
                            {},
                            StreamMessage.SIGNATURE_TYPES.NONE,
                            null
                        )
                    ),
                ])
            }

            resendHandler = new ResendHandler([firstStrategy, secondStrategy, thirdStrategy],
                notifyError)
        })

        test('handleRequest(request) returns stream with expected messages', async () => {
            const streamAsArray = await waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))
            expect(streamAsArray).toHaveLength(3)
        })

        test('handleRequest(request) invokes notifyError', async () => {
            await waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))
            expect(notifyError).toHaveBeenCalledTimes(1)
        })
    })

    describe('initialized with 1st and 2nd strategy both fulfilling', () => {
        let neverShouldBeInvokedFn
        beforeEach(() => {
            neverShouldBeInvokedFn = jest.fn()

            const firstStrategy = {
                getResendResponseStream: () => intoStream.object([
                    ControlLayer.UnicastMessage.create(
                        'requestId', StreamMessage.create(
                            ['streamId', 0, 1000, 0, 'publisher', 'msgChain'],
                            null,
                            StreamMessage.CONTENT_TYPES.MESSAGE,
                            StreamMessage.ENCRYPTION_TYPES.NONE,
                            {},
                            StreamMessage.SIGNATURE_TYPES.NONE,
                            null
                        )
                    )
                ])
            }

            const secondStrategy = {
                getResendResponseStream: neverShouldBeInvokedFn
            }

            resendHandler = new ResendHandler([firstStrategy, secondStrategy], notifyError)
        })

        test('on handleRequest(request) 2nd strategy is never used (short-circuit)', async () => {
            const stream = resendHandler.handleRequest(request, 'source')
            await waitForStreamToEnd(stream)
            expect(neverShouldBeInvokedFn).not.toHaveBeenCalled()
        })
    })

    test('arguments to notifyError are formed correctly', async () => {
        resendHandler = new ResendHandler([{
            getResendResponseStream: () => intoStream.object(Promise.reject(new Error('yikes')))
        }], notifyError)

        await waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))

        expect(notifyError).toBeCalledWith({
            request: ControlLayer.ResendLastRequest.create(
                'streamId',
                0,
                'requestId',
                10,
                undefined
            ),
            error: new Error('yikes'),
        })
    })

    test('unicast messages are piped through without changes', async () => {
        resendHandler = new ResendHandler([{
            getResendResponseStream: () => intoStream.object([
                ControlLayer.UnicastMessage.create(
                    'requestId', StreamMessage.create(
                        ['streamId', 0, 756, 0, 'publisherId', 'msgChainId'],
                        [666, 50],
                        StreamMessage.CONTENT_TYPES.MESSAGE,
                        StreamMessage.ENCRYPTION_TYPES.NONE,
                        {
                            hello: 'world'
                        },
                        StreamMessage.SIGNATURE_TYPES.ETH,
                        'signature'
                    )
                )
            ])
        }], notifyError)
        const streamAsArray = await waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))

        expect(streamAsArray[0]).toEqual(ControlLayer.UnicastMessage.create(
            'requestId', StreamMessage.create(
                ['streamId', 0, 756, 0, 'publisherId', 'msgChainId'],
                [666, 50],
                StreamMessage.CONTENT_TYPES.MESSAGE,
                StreamMessage.ENCRYPTION_TYPES.NONE,
                {
                    hello: 'world'
                },
                StreamMessage.SIGNATURE_TYPES.ETH,
                'signature'
            )
        ))
    })

    test('metrics work', async () => {
        resendHandler = new ResendHandler([{
            getResendResponseStream: () => {
                const s = new Readable({
                    objectMode: true,
                    read() {}
                })
                setTimeout(() => s.push(null), 10)
                return s
            }
        }], notifyError)

        expect(resendHandler.metrics()).toEqual({
            meanAge: 0,
            numOfOngoingResends: 0
        })

        const p1 = waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))
        const p2 = waitForStreamToEnd(resendHandler.handleRequest(request, 'source'))
        expect(resendHandler.metrics()).toMatchObject({
            meanAge: expect.any(Number),
            numOfOngoingResends: 2
        })

        await Promise.all([p1, p2])
        expect(resendHandler.metrics()).toEqual({
            meanAge: 0,
            numOfOngoingResends: 0
        })
    })
})
