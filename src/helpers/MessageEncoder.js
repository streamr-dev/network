const StatusMessage = require('../messages/StatusMessage')
const InstructionMessage = require('../messages/InstructionMessage')
const DataMessage = require('../messages/DataMessage')
const SubscribeMessage = require('../messages/SubscribeMessage')
const UnsubscribeMessage = require('../messages/UnsubscribeMessage')
const { StreamID, MessageID, MessageReference } = require('../identifiers')
const { msgTypes, CURRENT_VERSION } = require('../messages/messageTypes')

const encode = (type, payload) => {
    if (type < 0 || type > 6) {
        throw new Error(`Unknown message type: ${type}`)
    }

    return JSON.stringify({
        version: CURRENT_VERSION,
        code: type,
        payload
    })
}

const decode = (source, message) => {
    const { code, payload } = JSON.parse(message)

    switch (code) {
        case msgTypes.STATUS:
            return new StatusMessage(payload, source)

        case msgTypes.INSTRUCTION:
            return new InstructionMessage(
                new StreamID(payload.streamId, payload.streamPartition),
                payload.nodeAddresses,
                source
            )

        case msgTypes.DATA:
            return new DataMessage(
                MessageID.fromObject(payload.messageId),
                payload.previousMessageReference === null
                    ? null
                    : MessageReference.fromObject(payload.previousMessageReference),
                payload.data,
                payload.signature,
                payload.signatureType,
                source
            )

        case msgTypes.SUBSCRIBE:
            return new SubscribeMessage(
                new StreamID(payload.streamId, payload.streamPartition),
                payload.leechOnly,
                source
            )

        case msgTypes.UNSUBSCRIBE:
            return new UnsubscribeMessage(
                new StreamID(payload.streamId, payload.streamPartition),
                source
            )

        default:
            throw new Error(`Unknown message type: ${code}`)
    }
}

const getMsgPrefix = (msgCode) => Object.keys(msgTypes).find((key) => msgTypes[key] === msgCode)

module.exports = {
    getMsgPrefix,
    decode,
    statusMessage: (status) => encode(msgTypes.STATUS, status),
    dataMessage: (messageId, previousMessageReference, data, signature, signatureType) => encode(msgTypes.DATA, {
        messageId,
        previousMessageReference,
        data,
        signature,
        signatureType
    }),
    subscribeMessage: (streamId, leechOnly) => encode(msgTypes.SUBSCRIBE, {
        streamId: streamId.id,
        streamPartition: streamId.partition,
        leechOnly
    }),
    unsubscribeMessage: (streamId) => encode(msgTypes.UNSUBSCRIBE, {
        streamId: streamId.id,
        streamPartition: streamId.partition,
    }),
    instructionMessage: (streamId, nodeAddresses) => encode(msgTypes.INSTRUCTION, {
        streamId: streamId.id,
        streamPartition: streamId.partition,
        nodeAddresses
    }),
    ...msgTypes,
    CURRENT_VERSION
}
