const PeersMessage = require('../messages/PeersMessage')
const StatusMessage = require('../messages/StatusMessage')
const StreamMessage = require('../messages/StreamMessage')
const DataMessage = require('../messages/DataMessage')
const SubscribeMessage = require('../messages/SubscribeMessage')
const UnsubscribeMessage = require('../messages/UnsubscribeMessage')
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
        case msgTypes.PEERS:
            return new PeersMessage(payload, source)

        case msgTypes.STATUS:
            return new StatusMessage(payload, source)

        case msgTypes.STREAM:
            return new StreamMessage(payload.streamId, payload.leaderAddress, payload.repeaterAddresses, source)

        case msgTypes.DATA:
            return new DataMessage(payload.streamId, payload.data, payload.number, payload.previousNumber, source)

        case msgTypes.SUBSCRIBE:
            return new SubscribeMessage(payload, source)

        case msgTypes.UNSUBSCRIBE:
            return new UnsubscribeMessage(payload, source)

        default:
            throw new Error(`Unknown message type: ${code}`)
    }
}

const getMsgPrefix = (msgCode) => Object.keys(msgTypes).find((key) => msgTypes[key] === msgCode)

module.exports = {
    getMsgPrefix,
    decode,
    peersMessage: (peers) => encode(msgTypes.PEERS, peers),
    statusMessage: (status) => encode(msgTypes.STATUS, status),
    dataMessage: (streamId, data, number = null, previousNumber = null) => encode(msgTypes.DATA, {
        streamId, data, number, previousNumber
    }),
    subscribeMessage: (streamId) => encode(msgTypes.SUBSCRIBE, streamId),
    unsubscribeMessage: (streamId) => encode(msgTypes.UNSUBSCRIBE, streamId),
    streamMessage: (streamId, leaderAddress, repeaterAddresses) => encode(msgTypes.STREAM, {
        streamId, leaderAddress, repeaterAddresses
    }),
    ...msgTypes,
    CURRENT_VERSION
}
