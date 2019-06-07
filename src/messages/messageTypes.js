const CURRENT_VERSION = require('../../package.json').version

const msgTypes = {
    STATUS: 0,
    SUBSCRIBE: 2,
    INSTRUCTION: 5,
    FIND_STORAGE_NODES: 13,
    STORAGE_NODES: 14
}

const disconnectionReasons = Object.freeze({
    GRACEFUL_SHUTDOWN: 'streamr:node:graceful-shutdown',
    DUPLICATE_SOCKET: 'streamr:endpoint:duplicate-connection',
    NO_SHARED_STREAMS: 'streamr:node:no-shared-streams'
})

module.exports = {
    msgTypes,
    CURRENT_VERSION,
    disconnectionReasons
}
