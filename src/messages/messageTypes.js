const CURRENT_VERSION = require('../../package.json').version

const msgTypes = {
    STATUS: 0x00,
    DATA: 0x02,
    SUBSCRIBE: 0x03,
    UNSUBSCRIBE: 0x04,
    PUBLISH: 0x05,
    STREAM: 0x06
}

const disconnectionReasons = Object.freeze({
    MAX_OUTBOUND_CONNECTIONS: 'streamr:node:max-outbound-connections',
    MAX_INBOUND_CONNECTIONS: 'streamr:node:max-inbound-connections'
})

module.exports = {
    msgTypes,
    CURRENT_VERSION,
    disconnectionReasons
}
