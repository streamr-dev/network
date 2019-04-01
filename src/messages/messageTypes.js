const CURRENT_VERSION = require('../../package.json').version

const msgTypes = {
    STATUS: 0x00,
    DATA: 0x02,
    SUBSCRIBE: 0x03,
    UNSUBSCRIBE: 0x04,
    PUBLISH: 0x05,
    INSTRUCTION: 0x06
}

const disconnectionReasons = Object.freeze({
    TRACKER_INSTRUCTION: 'streamr:node:tracker-instruction',
    GRACEFUL_SHUTDOWN: 'streamr:node:graceful-shutdown',
    DUPLICATE_SOCKET: 'streamr:endpoint:duplicate-connection',
    NO_SHARED_STREAMS: 'streamr:node:no-shared-streams'
})

module.exports = {
    msgTypes,
    CURRENT_VERSION,
    disconnectionReasons
}
