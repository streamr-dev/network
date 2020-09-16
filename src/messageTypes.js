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
    disconnectionCodes,
    disconnectionReasons
}
