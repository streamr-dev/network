const encoder = require('../../src/helpers/MessageEncoder')
const { version } = require('../../package.json')
const DataMessage = require('../../src/messages/DataMessage')
const InstructionMessage = require('../../src/messages/InstructionMessage')
const ResendLastRequest = require('../../src/messages/ResendLastRequest')
const ResendFromRequest = require('../../src/messages/ResendFromRequest')
const ResendRangeRequest = require('../../src/messages/ResendRangeRequest')
const ResendResponseResent = require('../../src/messages/ResendResponseResent')
const ResendResponseResending = require('../../src/messages/ResendResponseResending')
const ResendResponseNoResend = require('../../src/messages/ResendResponseNoResend')
const UnicastMessage = require('../../src/messages/UnicastMessage')
const { StreamID, MessageID, MessageReference } = require('../../src/identifiers')

describe('encoder', () => {
    it('check streamMessage encoding/decoding', () => {
        const json = encoder.instructionMessage(new StreamID('stream-id', 0), ['node-1', 'node-2'])
        expect(JSON.parse(json)).toEqual({
            code: encoder.INSTRUCTION,
            version,
            payload: {
                streamId: 'stream-id',
                streamPartition: 0,
                nodeAddresses: [
                    'node-1',
                    'node-2'
                ]
            }
        })

        const source = '127.0.0.1'
        const streamMessage = encoder.decode(source, json)

        expect(streamMessage).toBeInstanceOf(InstructionMessage)
        expect(streamMessage.getSource()).toEqual('127.0.0.1')
        expect(streamMessage.getStreamId()).toEqual(new StreamID('stream-id', 0))
        expect(streamMessage.getNodeAddresses()).toEqual(['node-1', 'node-2'])
    })

    it('check dataMessage encoding (without previousMessageReference)', () => {
        const actual = encoder.dataMessage(
            new MessageID(new StreamID('stream-id', 0), 666666666, 133, 'publisher-id', 'session-id'),
            null,
            {
                hello: 'world'
            },
            null,
            0
        )
        expect(JSON.parse(actual)).toEqual({
            code: encoder.DATA,
            version,
            payload: {
                messageId: {
                    streamId: {
                        id: 'stream-id',
                        partition: 0
                    },
                    timestamp: 666666666,
                    sequenceNo: 133,
                    publisherId: 'publisher-id',
                    msgChainId: 'session-id'
                },
                previousMessageReference: null,
                data: {
                    hello: 'world',
                },
                signature: null,
                signatureType: 0
            }
        })
    })

    it('check dataMessage encoding (with previousMessageReference)', () => {
        const actual = encoder.dataMessage(
            new MessageID(new StreamID('stream-id', 0), 666666666, 133, 'publisher-id', 'session-id'),
            new MessageReference(555555555, 0),
            {
                hello: 'world'
            },
            'signature',
            1
        )
        expect(JSON.parse(actual)).toEqual({
            code: encoder.DATA,
            version,
            payload: {
                messageId: {
                    streamId: {
                        id: 'stream-id',
                        partition: 0
                    },
                    timestamp: 666666666,
                    sequenceNo: 133,
                    publisherId: 'publisher-id',
                    msgChainId: 'session-id'
                },
                previousMessageReference: {
                    timestamp: 555555555,
                    sequenceNo: 0
                },
                data: {
                    hello: 'world',
                },
                signature: 'signature',
                signatureType: 1
            }
        })
    })

    it('decoding dataMessage json returns DataMessage (without previousMessageReference)', () => {
        const payload = {
            code: encoder.DATA,
            version,
            payload: {
                messageId: {
                    streamId: {
                        id: 'stream-id',
                        partition: 0
                    },
                    timestamp: 666666666,
                    sequenceNo: 133,
                    publisherId: 'publisher-id',
                    msgChainId: 'session-id'
                },
                previousMessageReference: null,
                data: {
                    hello: 'world',
                },
                signature: 'signature',
                signatureType: 2
            }
        }

        const dataMessage = encoder.decode('source-id', JSON.stringify(payload))

        expect(dataMessage).toBeInstanceOf(DataMessage)
        expect(dataMessage.getSource()).toEqual('source-id')
        expect(dataMessage.getMessageId())
            .toEqual(new MessageID(new StreamID('stream-id', 0), 666666666, 133, 'publisher-id', 'session-id'))
        expect(dataMessage.getPreviousMessageReference()).toBeNull()
        expect(dataMessage.getData()).toEqual({
            hello: 'world'
        })
        expect(dataMessage.getSignature()).toEqual('signature')
        expect(dataMessage.getSignatureType()).toEqual(2)
    })

    it('decoding dataMessage json returns DataMessage (with previousMessageReference)', () => {
        const payload = {
            code: encoder.DATA,
            version,
            payload: {
                messageId: {
                    streamId: {
                        id: 'stream-id',
                        partition: 0
                    },
                    timestamp: 666666666,
                    sequenceNo: 133,
                    publisherId: 'publisher-id',
                    msgChainId: 'session-id'
                },
                previousMessageReference: {
                    timestamp: 555555555,
                    sequenceNo: 0
                },
                data: {
                    hello: 'world',
                }
            }
        }

        const dataMessage = encoder.decode('source-id', JSON.stringify(payload))

        expect(dataMessage).toBeInstanceOf(DataMessage)
        expect(dataMessage.getSource()).toEqual('source-id')
        expect(dataMessage.getMessageId())
            .toEqual(new MessageID(new StreamID('stream-id', 0), 666666666, 133, 'publisher-id', 'session-id'))
        expect(dataMessage.getPreviousMessageReference()).toEqual(new MessageReference(555555555, 0))
        expect(dataMessage.getData()).toEqual({
            hello: 'world'
        })
    })

    it('check encoding RESEND_LAST', () => {
        const actual = encoder.resendLastRequest(new StreamID('stream', 6), 'subId', 100)
        expect(JSON.parse(actual)).toEqual({
            version,
            code: encoder.RESEND_LAST,
            payload: {
                streamId: 'stream',
                streamPartition: 6,
                subId: 'subId',
                numberLast: 100
            }
        })
    })

    it('check decoding RESEND_LAST', () => {
        const resendLastRequest = encoder.decode('source', JSON.stringify({
            version,
            code: encoder.RESEND_LAST,
            payload: {
                streamId: 'stream',
                streamPartition: 6,
                subId: 'subId',
                numberLast: 100
            }
        }))

        expect(resendLastRequest).toBeInstanceOf(ResendLastRequest)
        expect(resendLastRequest.getVersion()).toEqual(version)
        expect(resendLastRequest.getCode()).toEqual(encoder.RESEND_LAST)
        expect(resendLastRequest.getSource()).toEqual('source')

        expect(resendLastRequest.getStreamId()).toEqual(new StreamID('stream', 6))
        expect(resendLastRequest.getSubId()).toEqual('subId')
        expect(resendLastRequest.getNumberLast()).toEqual(100)
    })

    it('check encoding RESEND_FROM', () => {
        const actual = encoder.resendFromRequest(
            new StreamID('stream', 6),
            'subId',
            new MessageReference(6666, 0),
            'publisherId'
        )
        expect(JSON.parse(actual)).toEqual({
            version,
            code: encoder.RESEND_FROM,
            payload: {
                streamId: 'stream',
                streamPartition: 6,
                subId: 'subId',
                fromMsgRef: {
                    timestamp: 6666,
                    sequenceNo: 0
                },
                publisherId: 'publisherId'
            }
        })
    })

    it('check decoding RESEND_FROM', () => {
        const resendFromRequest = encoder.decode('source', JSON.stringify({
            version,
            code: encoder.RESEND_FROM,
            payload: {
                streamId: 'stream',
                streamPartition: 6,
                subId: 'subId',
                fromMsgRef: {
                    timestamp: 6666,
                    sequenceNo: 0
                },
                publisherId: 'publisherId'
            }
        }))

        expect(resendFromRequest).toBeInstanceOf(ResendFromRequest)
        expect(resendFromRequest.getVersion()).toEqual(version)
        expect(resendFromRequest.getCode()).toEqual(encoder.RESEND_FROM)
        expect(resendFromRequest.getSource()).toEqual('source')

        expect(resendFromRequest.getStreamId()).toEqual(new StreamID('stream', 6))
        expect(resendFromRequest.getSubId()).toEqual('subId')
        expect(resendFromRequest.getFromMsgRef()).toEqual(new MessageReference(6666, 0))
    })

    it('check encoding RESEND_RANGE', () => {
        const actual = encoder.resendRangeRequest(
            new StreamID('stream', 6),
            'subId',
            new MessageReference(6666, 0),
            new MessageReference(7000, 100),
            'publisherId'
        )
        expect(JSON.parse(actual)).toEqual({
            version,
            code: encoder.RESEND_RANGE,
            payload: {
                streamId: 'stream',
                streamPartition: 6,
                subId: 'subId',
                fromMsgRef: {
                    timestamp: 6666,
                    sequenceNo: 0
                },
                toMsgRef: {
                    timestamp: 7000,
                    sequenceNo: 100
                },
                publisherId: 'publisherId'
            }
        })
    })

    it('check decoding RESEND_RANGE', () => {
        const resendRangeRequest = encoder.decode('source', JSON.stringify({
            version,
            code: encoder.RESEND_RANGE,
            payload: {
                streamId: 'stream',
                streamPartition: 6,
                subId: 'subId',
                fromMsgRef: {
                    timestamp: 6666,
                    sequenceNo: 0
                },
                toMsgRef: {
                    timestamp: 7000,
                    sequenceNo: 100
                },
                publisherId: 'publisherId'
            }
        }))

        expect(resendRangeRequest).toBeInstanceOf(ResendRangeRequest)
        expect(resendRangeRequest.getVersion()).toEqual(version)
        expect(resendRangeRequest.getCode()).toEqual(encoder.RESEND_RANGE)
        expect(resendRangeRequest.getSource()).toEqual('source')

        expect(resendRangeRequest.getStreamId()).toEqual(new StreamID('stream', 6))
        expect(resendRangeRequest.getSubId()).toEqual('subId')
        expect(resendRangeRequest.getFromMsgRef()).toEqual(new MessageReference(6666, 0))
        expect(resendRangeRequest.getToMsgRef()).toEqual(new MessageReference(7000, 100))
    })

    it('check encoding RESEND_RESPONSE_RESENDING', () => {
        const actual = encoder.resendResponseResending(
            new StreamID('stream', 6),
            'subId'
        )
        expect(JSON.parse(actual)).toEqual({
            version,
            code: encoder.RESEND_RESPONSE_RESENDING,
            payload: {
                streamId: 'stream',
                streamPartition: 6,
                subId: 'subId'
            }
        })
    })

    it('check decoding RESEND_RESPONSE_RESENDING', () => {
        const resendResponseResending = encoder.decode('source', JSON.stringify({
            version,
            code: encoder.RESEND_RESPONSE_RESENDING,
            payload: {
                streamId: 'stream',
                streamPartition: 6,
                subId: 'subId'
            }
        }))

        expect(resendResponseResending).toBeInstanceOf(ResendResponseResending)
        expect(resendResponseResending.getVersion()).toEqual(version)
        expect(resendResponseResending.getCode()).toEqual(encoder.RESEND_RESPONSE_RESENDING)
        expect(resendResponseResending.getSource()).toEqual('source')

        expect(resendResponseResending.getStreamId()).toEqual(new StreamID('stream', 6))
        expect(resendResponseResending.getSubId()).toEqual('subId')
    })

    it('check encoding RESEND_RESPONSE_RESENT', () => {
        const actual = encoder.resendResponseResent(
            new StreamID('stream', 6),
            'subId'
        )
        expect(JSON.parse(actual)).toEqual({
            version,
            code: encoder.RESEND_RESPONSE_RESENT,
            payload: {
                streamId: 'stream',
                streamPartition: 6,
                subId: 'subId'
            }
        })
    })

    it('check decoding RESEND_RESPONSE_RESENT', () => {
        const resendResponseResent = encoder.decode('source', JSON.stringify({
            version,
            code: encoder.RESEND_RESPONSE_RESENT,
            payload: {
                streamId: 'stream',
                streamPartition: 6,
                subId: 'subId'
            }
        }))

        expect(resendResponseResent).toBeInstanceOf(ResendResponseResent)
        expect(resendResponseResent.getVersion()).toEqual(version)
        expect(resendResponseResent.getCode()).toEqual(encoder.RESEND_RESPONSE_RESENT)
        expect(resendResponseResent.getSource()).toEqual('source')

        expect(resendResponseResent.getStreamId()).toEqual(new StreamID('stream', 6))
        expect(resendResponseResent.getSubId()).toEqual('subId')
    })

    it('check encoding RESEND_RESPONSE_NO_RESEND', () => {
        const actual = encoder.resendResponseNoResend(
            new StreamID('stream', 6),
            'subId'
        )
        expect(JSON.parse(actual)).toEqual({
            version,
            code: encoder.RESEND_RESPONSE_NO_RESEND,
            payload: {
                streamId: 'stream',
                streamPartition: 6,
                subId: 'subId'
            }
        })
    })

    it('check decoding RESEND_RESPONSE_NO_RESEND', () => {
        const resendResponseNoResend = encoder.decode('source', JSON.stringify({
            version,
            code: encoder.RESEND_RESPONSE_NO_RESEND,
            payload: {
                streamId: 'stream',
                streamPartition: 6,
                subId: 'subId'
            }
        }))

        expect(resendResponseNoResend).toBeInstanceOf(ResendResponseNoResend)
        expect(resendResponseNoResend.getVersion()).toEqual(version)
        expect(resendResponseNoResend.getCode()).toEqual(encoder.RESEND_RESPONSE_NO_RESEND)
        expect(resendResponseNoResend.getSource()).toEqual('source')

        expect(resendResponseNoResend.getStreamId()).toEqual(new StreamID('stream', 6))
        expect(resendResponseNoResend.getSubId()).toEqual('subId')
    })

    it('check encoding UNICAST', () => {
        const actual = encoder.unicastMessage(
            new MessageID(new StreamID('stream-id', 0), 666666666, 133, 'publisher-id', 'session-id'),
            new MessageReference(555555555, 0),
            {
                hello: 'world'
            },
            'signature',
            1,
            'subId'
        )
        expect(JSON.parse(actual)).toEqual({
            code: encoder.UNICAST,
            version,
            payload: {
                messageId: {
                    streamId: {
                        id: 'stream-id',
                        partition: 0
                    },
                    timestamp: 666666666,
                    sequenceNo: 133,
                    publisherId: 'publisher-id',
                    msgChainId: 'session-id'
                },
                previousMessageReference: {
                    timestamp: 555555555,
                    sequenceNo: 0
                },
                data: {
                    hello: 'world',
                },
                signature: 'signature',
                signatureType: 1,
                subId: 'subId'
            }
        })
    })

    it('check decoding UNICAST', () => {
        const unicastMessage = encoder.decode('source', JSON.stringify({
            code: encoder.UNICAST,
            version,
            payload: {
                messageId: {
                    streamId: {
                        id: 'stream-id',
                        partition: 0
                    },
                    timestamp: 666666666,
                    sequenceNo: 133,
                    publisherId: 'publisher-id',
                    msgChainId: 'session-id'
                },
                previousMessageReference: {
                    timestamp: 555555555,
                    sequenceNo: 0
                },
                data: {
                    hello: 'world',
                },
                signature: 'signature',
                signatureType: 1,
                subId: 'subId'
            }
        }))

        expect(unicastMessage).toBeInstanceOf(UnicastMessage)
        expect(unicastMessage.getVersion()).toEqual(version)
        expect(unicastMessage.getCode()).toEqual(encoder.UNICAST)
        expect(unicastMessage.getSource()).toEqual('source')

        expect(unicastMessage.getMessageId()).toEqual(new MessageID(
            new StreamID('stream-id', 0),
            666666666,
            133,
            'publisher-id',
            'session-id'
        ))
        expect(unicastMessage.getPreviousMessageReference()).toEqual(new MessageReference(555555555, 0))
        expect(unicastMessage.getData()).toEqual({
            hello: 'world'
        })
        expect(unicastMessage.getSignature()).toEqual('signature')
        expect(unicastMessage.getSignatureType()).toEqual(1)
        expect(unicastMessage.getSubId()).toEqual('subId')
    })
})

