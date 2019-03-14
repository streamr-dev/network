const encoder = require('../../src/helpers/MessageEncoder')
const { version } = require('../../package.json')
const DataMessage = require('../../src/messages/DataMessage')
const InstructionMessage = require('../../src/messages/InstructionMessage')
const { StreamID, MessageID, MessageReference } = require('../../src/identifiers')

describe('encoder', () => {
    it('check all codes', (done) => {
        expect(encoder.STATUS).toEqual(0)
        expect(encoder.DATA).toEqual(2)
        expect(encoder.SUBSCRIBE).toEqual(3)
        expect(encoder.UNSUBSCRIBE).toEqual(4)
        expect(encoder.PUBLISH).toEqual(5)
        expect(encoder.INSTRUCTION).toEqual(6)

        done()
    })

    it('check all code messages', (done) => {
        expect(encoder.getMsgPrefix(encoder.STATUS)).toEqual('STATUS')
        expect(encoder.getMsgPrefix(encoder.SUBSCRIBE)).toEqual('SUBSCRIBE')
        expect(encoder.getMsgPrefix(encoder.PUBLISH)).toEqual('PUBLISH')
        expect(encoder.getMsgPrefix(encoder.INSTRUCTION)).toEqual('INSTRUCTION')

        done()
    })

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
})

