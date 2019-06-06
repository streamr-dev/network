const encoder = require('../../src/helpers/MessageEncoder')
const { version } = require('../../package.json')
const FindStorageNodesMessage = require('../../src/messages/FindStorageNodesMessage')
const InstructionMessage = require('../../src/messages/InstructionMessage')
const ResendLastRequest = require('../../src/messages/ResendLastRequest')
const ResendFromRequest = require('../../src/messages/ResendFromRequest')
const ResendRangeRequest = require('../../src/messages/ResendRangeRequest')
const ResendResponseResent = require('../../src/messages/ResendResponseResent')
const ResendResponseResending = require('../../src/messages/ResendResponseResending')
const ResendResponseNoResend = require('../../src/messages/ResendResponseNoResend')
const StorageNodesMessage = require('../../src/messages/StorageNodesMessage')
const { StreamID, MessageReference } = require('../../src/identifiers')

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
            'publisherId',
            'msgChainId'
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
                publisherId: 'publisherId',
                msgChainId: 'msgChainId'
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
                publisherId: 'publisherId',
                msgChainId: 'msgChainId'
            }
        }))

        expect(resendFromRequest).toBeInstanceOf(ResendFromRequest)
        expect(resendFromRequest.getVersion()).toEqual(version)
        expect(resendFromRequest.getCode()).toEqual(encoder.RESEND_FROM)
        expect(resendFromRequest.getSource()).toEqual('source')

        expect(resendFromRequest.getStreamId()).toEqual(new StreamID('stream', 6))
        expect(resendFromRequest.getSubId()).toEqual('subId')
        expect(resendFromRequest.getFromMsgRef()).toEqual(new MessageReference(6666, 0))
        expect(resendFromRequest.getPublisherId()).toEqual('publisherId')
        expect(resendFromRequest.getMsgChainId()).toEqual('msgChainId')
    })

    it('check encoding RESEND_RANGE', () => {
        const actual = encoder.resendRangeRequest(
            new StreamID('stream', 6),
            'subId',
            new MessageReference(6666, 0),
            new MessageReference(7000, 100),
            'publisherId',
            'msgChainId'
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
                publisherId: 'publisherId',
                msgChainId: 'msgChainId'
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
                publisherId: 'publisherId',
                msgChainId: 'msgChainId'
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
        expect(resendRangeRequest.getPublisherId()).toEqual('publisherId')
        expect(resendRangeRequest.getMsgChainId()).toEqual('msgChainId')
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

    it('check encoding FIND_STORAGE_NODES', () => {
        const actual = encoder.findStorageNodesMessage(new StreamID('stream-id', 0))
        expect(JSON.parse(actual)).toEqual({
            code: encoder.FIND_STORAGE_NODES,
            version,
            payload: {
                streamId: 'stream-id',
                streamPartition: 0
            }
        })
    })

    it('check decoding FIND_STORAGE_NODES', () => {
        const unicastMessage = encoder.decode('source', JSON.stringify({
            code: encoder.FIND_STORAGE_NODES,
            version,
            payload: {
                streamId: 'stream-id',
                streamPartition: 0
            }
        }))

        expect(unicastMessage).toBeInstanceOf(FindStorageNodesMessage)
        expect(unicastMessage.getVersion()).toEqual(version)
        expect(unicastMessage.getCode()).toEqual(encoder.FIND_STORAGE_NODES)
        expect(unicastMessage.getSource()).toEqual('source')

        expect(unicastMessage.getStreamId()).toEqual(new StreamID('stream-id', 0))
    })

    it('check encoding STORAGE_NODES', () => {
        const actual = encoder.storageNodesMessage(new StreamID('stream-id', 0), ['ws://node-1', 'ws://node-2'])
        expect(JSON.parse(actual)).toEqual({
            code: encoder.STORAGE_NODES,
            version,
            payload: {
                streamId: 'stream-id',
                streamPartition: 0,
                nodeAddresses: [
                    'ws://node-1',
                    'ws://node-2'
                ]
            }
        })
    })

    it('check decoding STORAGE_NODES', () => {
        const unicastMessage = encoder.decode('source', JSON.stringify({
            code: encoder.STORAGE_NODES,
            version,
            payload: {
                streamId: 'stream-id',
                streamPartition: 0,
                nodeAddresses: [
                    'ws://node-1',
                    'ws://node-2'
                ]
            }
        }))

        expect(unicastMessage).toBeInstanceOf(StorageNodesMessage)
        expect(unicastMessage.getVersion()).toEqual(version)
        expect(unicastMessage.getCode()).toEqual(encoder.STORAGE_NODES)
        expect(unicastMessage.getSource()).toEqual('source')

        expect(unicastMessage.getStreamId()).toEqual(new StreamID('stream-id', 0))
        expect(unicastMessage.getNodeAddresses()).toEqual(['ws://node-1', 'ws://node-2'])
    })
})

