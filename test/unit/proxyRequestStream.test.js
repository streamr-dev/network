const intoStream = require('into-stream')
const {
    ResendResponseResending,
    ResendResponseNoResend,
    ResendResponseResent,
    UnicastMessage,
    ResendLastRequest,
} = require('streamr-client-protocol').ControlLayer
const { StreamMessage } = require('streamr-client-protocol').MessageLayer

const proxyRequestStream = require('../../src/logic/proxyRequestStream')

describe('proxyRequestStream', () => {
    let sendFn
    let request

    beforeEach(() => {
        sendFn = jest.fn()
        request = ResendLastRequest.create('streamId', 0, 'subId', 10, 'sessionToken')
    })

    it('empty requestStream causes only NoResend to be sent', (done) => {
        const stream = intoStream.object([])
        proxyRequestStream(sendFn, request, stream)
        stream.on('end', () => {
            expect(sendFn.mock.calls).toEqual([
                [ResendResponseNoResend.create('streamId', 0, 'subId')]
            ])
            done()
        })
    })

    it('requestStream with messages causes Resending, Unicast(s), and Resent to be sent', (done) => {
        const firstMessage = StreamMessage.from({
            streamId: 'streamId',
            streamPartition: 0,
            timestamp: 10000000,
            sequenceNumber: 0,
            publisherId: 'publisherId',
            msgChainId: 'msgChainId',
            content: {
                hello: 'world'
            }
        })
        const secondMessage = StreamMessage.from({
            streamId: 'streamId',
            streamPartition: 0,
            timestamp: 20000000,
            sequenceNumber: 0,
            publisherId: 'publisherId',
            msgChainId: 'msgChainId',
            content: {
                moi: 'maailma'
            }
        })
        const stream = intoStream.object([
            UnicastMessage.create('subId', firstMessage),
            UnicastMessage.create('subId', secondMessage)
        ])

        proxyRequestStream(sendFn, request, stream)

        stream.on('end', () => {
            expect(sendFn.mock.calls).toEqual([
                [ResendResponseResending.create('streamId', 0, 'subId')],
                [UnicastMessage.create('subId', firstMessage)],
                [UnicastMessage.create('subId', secondMessage)],
                [ResendResponseResent.create('streamId', 0, 'subId')],
            ])
            done()
        })
    })
})
