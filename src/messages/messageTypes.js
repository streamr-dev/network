const CURRENT_VERSION = require('../../package.json').version

const msgTypes = {
    STATUS: 0,
    DATA: 1,
    SUBSCRIBE: 2,
    UNSUBSCRIBE: 3,
    PUBLISH: 4,
    INSTRUCTION: 5,
    RESEND_LAST: 6,
    RESEND_FROM: 7,
    RESEND_RANGE: 8,
    RESEND_RESPONSE_RESENDING: 9,
    RESEND_RESPONSE_RESENT: 10,
    RESEND_RESPONSE_NO_RESEND: 11,
    UNICAST: 12,
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
