const CURRENT_VERSION = require('../../package.json').version

const msgTypes = {
    STATUS: 0,
    INSTRUCTION: 1,
    FIND_STORAGE_NODES: 2,
    STORAGE_NODES: 3,
    WRAPPER: 4,
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
