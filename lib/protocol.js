exports.CURRENT_BROWSER_VERSION = 0
exports.BROWSER_MSG_TYPE_BROADCAST = 0
exports.BROWSER_MSG_TYPE_UNICAST = 1
exports.BROWSER_MSG_TYPE_SUBSCRIBED = 2
exports.BROWSER_MSG_TYPE_UNSUBSCRIBED = 3
exports.BROWSER_MSG_TYPE_RESENDING = 4
exports.BROWSER_MSG_TYPE_RESENT = 5
exports.BROWSER_MSG_TYPE_NO_RESEND = 6
exports.BROWSER_MSG_TYPE_ERROR = 7

exports.encodeForBrowser = function(type, messageWithKafkaMetaData, subId) {
	if (type < 0 || type > 6) {
		throw "Unknown browser message type: "+type
	}

	const content = messageWithKafkaMetaData.toArray()
	subId = subId || ""

	return JSON.stringify([exports.CURRENT_BROWSER_VERSION, type, subId, content])
}