const CURRENT_VERSION = require('../../package.json').version

const msgTypes = {
    STATUS: 0,
    INSTRUCTION: 1,
    FIND_STORAGE_NODES: 2,
    STORAGE_NODES: 3,
    WRAPPER: 4,
}

const disconnectionCodes = Object.freeze({
    GRACEFUL_SHUTDOWN: 1000,
    DUPLICATE_SOCKET: 1002,
    NO_SHARED_STREAMS: 1000,
    MISSING_REQUIRED_PARAMETER: 1002,
    DEAD_CONNECTION: 1002
})

const disconnectionReasons = Object.freeze({
    GRACEFUL_SHUTDOWN: 'streamr:node:graceful-shutdown',
    DUPLICATE_SOCKET: 'streamr:endpoint:duplicate-connection',
    NO_SHARED_STREAMS: 'streamr:node:no-shared-streams',
    MISSING_REQUIRED_PARAMETER: 'streamr:node:missing-required-parameter',
    DEAD_CONNECTION: 'streamr:endpoint:dead-connection'
})

module.exports = {
    msgTypes,
    CURRENT_VERSION,
    disconnectionCodes,
    disconnectionReasons
}
