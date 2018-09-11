const CURRENT_VERSION = require('../../package.json').version

const msgTypes = {
    STATUS: 0x00,
    PEERS: 0x01,
    DATA: 0x02,
    SUBSCRIBE: 0x03,
    PUBLISH: 0x04,
    STREAM: 0x05,
}

const encode = (type, data) => {
    if (type < 0 || type > 7) {
        throw new Error(`Unknown message type: ${type}`)
    }

    return JSON.stringify({
        version: CURRENT_VERSION,
        code: type,
        data
    })
}

const decode = (message) => {
    const { version, code, data } = JSON.parse(message)
    return {
        version,
        code,
        data
    }
}

const getMsgPrefix = (msgCode) => Object.keys(msgTypes).find((key) => msgTypes[key] === msgCode)

module.exports = {
    getMsgPrefix,
    decode,
    peersMessage: (peers) => encode(msgTypes.PEERS, peers),
    statusMessage: (status) => encode(msgTypes.STATUS, status),
    dataMessage: (streamdId, data) => encode(msgTypes.DATA, [streamdId, data]),
    streamMessage: (streamdId, nodeAddress) => encode(msgTypes.STREAM, [streamdId, nodeAddress]),
    ...msgTypes,
}
