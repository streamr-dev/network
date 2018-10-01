const CURRENT_VERSION = require('../../package.json').version
const BasicMessage = require('../messages/BasicMessage')
const StatusMessage = require('../messages/StatusMessage')
const StreamMessage = require('../messages/StreamMessage')
const DataMessage = require('../messages/DataMessage')
const SubscribeMessage = require('../messages/SubscribeMessage')

const msgTypes = {
    STATUS: 0x00,
    PEERS: 0x01,
    DATA: 0x02,
    SUBSCRIBE: 0x03,
    UNSUBSCRIBE: 0x04,
    PUBLISH: 0x05,
    STREAM: 0x06
}

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
    const { version, code, payload } = JSON.parse(message)

    switch (code) {
        case msgTypes.STATUS:
            return Object.assign(new StatusMessage(), {
                version, code, source, payload
            })
        case msgTypes.STREAM:
            return Object.assign(new StreamMessage(), {
                version, code, source, payload
            })
        case msgTypes.DATA:
            return Object.assign(new DataMessage(), {
                version, code, source, payload
            })
        case msgTypes.SUBSCRIBE:
        case msgTypes.UNSUBSCRIBE:
            return Object.assign(new SubscribeMessage(), {
                version, code, source, payload
            })
        default:
            return Object.assign(new BasicMessage(), {
                version, code, source, payload
            })
    }
}

const getMsgPrefix = (msgCode) => Object.keys(msgTypes).find((key) => msgTypes[key] === msgCode)

module.exports = {
    getMsgPrefix,
    decode,
    peersMessage: (peers) => encode(msgTypes.PEERS, peers),
    statusMessage: (status) => encode(msgTypes.STATUS, status),
    dataMessage: (streamId, data) => encode(msgTypes.DATA, [streamId, data]),
    subscribeMessage: (streamId) => encode(msgTypes.SUBSCRIBE, streamId),
    unsubscribeMessage: (streamId) => encode(msgTypes.UNSUBSCRIBE, streamId),
    streamMessage: (streamId, nodeAddress) => encode(msgTypes.STREAM, [streamId, nodeAddress]),
    ...msgTypes
}
