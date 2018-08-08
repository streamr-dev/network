const CURRENT_BROWSER_VERSION = 0

const msgTypes = {
    BROWSER_MSG_TYPE_BROADCAST: 0,
    BROWSER_MSG_TYPE_UNICAST: 1,
    BROWSER_MSG_TYPE_SUBSCRIBED: 2,
    BROWSER_MSG_TYPE_UNSUBSCRIBED: 3,
    BROWSER_MSG_TYPE_RESENDING: 4,
    BROWSER_MSG_TYPE_RESENT: 5,
    BROWSER_MSG_TYPE_NO_RESEND: 6,
    BROWSER_MSG_TYPE_ERROR: 7,
}

function encodeForBrowser(type, content, subId) {
    if (type < 0 || type > 7) {
        throw new Error(`Unknown browser message type: ${type}`)
    }
    return JSON.stringify([CURRENT_BROWSER_VERSION, type, subId || '', content])
}

module.exports = {

    broadcastMessage: (msg) => encodeForBrowser(msgTypes.BROWSER_MSG_TYPE_BROADCAST, msg),

    unicastMessage: (msg, subId) => encodeForBrowser(msgTypes.BROWSER_MSG_TYPE_UNICAST, msg, subId),

    subscribedMessage: (response) => encodeForBrowser(msgTypes.BROWSER_MSG_TYPE_SUBSCRIBED, response),

    unsubscribedMessage: (response) => encodeForBrowser(msgTypes.BROWSER_MSG_TYPE_UNSUBSCRIBED, response),

    resendingMessage: (response) => encodeForBrowser(msgTypes.BROWSER_MSG_TYPE_RESENDING, response),

    resentMessage: (response) => encodeForBrowser(msgTypes.BROWSER_MSG_TYPE_RESENT, response),

    noResendMessage: (response) => encodeForBrowser(msgTypes.BROWSER_MSG_TYPE_NO_RESEND, response),

    errorMessage: (response) => encodeForBrowser(msgTypes.BROWSER_MSG_TYPE_ERROR, response),

    ...msgTypes,
}

