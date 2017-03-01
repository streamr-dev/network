const CURRENT_BROWSER_VERSION = 0

exports.BROWSER_MSG_TYPE_BROADCAST = 0
exports.BROWSER_MSG_TYPE_UNICAST = 1
exports.BROWSER_MSG_TYPE_SUBSCRIBED = 2
exports.BROWSER_MSG_TYPE_UNSUBSCRIBED = 3
exports.BROWSER_MSG_TYPE_RESENDING = 4
exports.BROWSER_MSG_TYPE_RESENT = 5
exports.BROWSER_MSG_TYPE_NO_RESEND = 6
exports.BROWSER_MSG_TYPE_ERROR = 7

function encodeForBrowser(type, content, subId) {
	if (type < 0 || type > 7) {
		throw "Unknown browser message type: " + type
	}
	return JSON.stringify([CURRENT_BROWSER_VERSION, type, subId || "", content])
}

exports.broadcastMessage = function(msg) {
	return encodeForBrowser(exports.BROWSER_MSG_TYPE_BROADCAST, msg)
}

exports.unicastMessage = function(msg, subId) {
	return encodeForBrowser(exports.BROWSER_MSG_TYPE_UNICAST, msg, subId)
}

exports.subscribedMessage = function(response) {
	return encodeForBrowser(exports.BROWSER_MSG_TYPE_SUBSCRIBED, response)
}

exports.unsubscribedMessage = function(response) {
	return encodeForBrowser(exports.BROWSER_MSG_TYPE_UNSUBSCRIBED, response)
}

exports.resendingMessage = function(response) {
	return encodeForBrowser(exports.BROWSER_MSG_TYPE_RESENDING, response)
}

exports.resentMessage = function(response) {
	return encodeForBrowser(exports.BROWSER_MSG_TYPE_RESENT, response)
}

exports.noResendMessage = function(response) {
	return encodeForBrowser(exports.BROWSER_MSG_TYPE_NO_RESEND, response)
}

exports.errorMessage = function(response) {
	return encodeForBrowser(exports.BROWSER_MSG_TYPE_ERROR, response)
}