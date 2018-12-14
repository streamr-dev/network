const StatusMessage = require('../messages/StatusMessage')
const StreamMessage = require('../messages/StreamMessage')
const DataMessage = require('../messages/DataMessage')
const SubscribeMessage = require('../messages/SubscribeMessage')
const UnsubscribeMessage = require('../messages/UnsubscribeMessage')
const { StreamID } = require('../identifiers')
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

        case msgTypes.STREAM:
            return new StreamMessage(
                new StreamID(payload.streamId, payload.streamPartition),
                payload.nodeAddresses,
                source
            )

        case msgTypes.DATA:
            return new DataMessage(
                new StreamID(payload.streamId, payload.streamPartition),
                payload.data,
                payload.number,
                payload.previousNumber,
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
    dataMessage: (streamId, data, number = null, previousNumber = null) => encode(msgTypes.DATA, {
        streamId: streamId.id,
        streamPartition: streamId.partition,
        data,
        number,
        previousNumber
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
    streamMessage: (streamId, nodeAddresses) => encode(msgTypes.STREAM, {
        streamId: streamId.id,
        streamPartition: streamId.partition,
        nodeAddresses
    }),
    ...msgTypes,
    CURRENT_VERSION
}
