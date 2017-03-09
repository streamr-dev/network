const fetch = require('node-fetch')
const memoize = require('memoizee')

const MAX_AGE = 24 * 60 * 60 * 1000 // 24 hours

function Authenticator(baseUrl) {
	this.url = baseUrl + "/api/v1/permissions/authenticate"
	this.authenticate = memoize(Authenticator.prototype._authenticate, {
		maxAge: MAX_AGE
	})
}

// TODO: expire cache item if stream changed / key compromised.

Authenticator.prototype._authenticate = function(streamId, authKey, operation) {
	const _this = this

	if (operation !== 'read' && operation !== 'write' && operation !== 'share') {
		throw 'Invalid operation: ' + operation
	}
	return fetch(_this.url + "?streamId=" + streamId + "&authKey=" + authKey + "&operation=" + operation)
		.then(function(response) {
			return new Promise(function(resolve, reject) {
				if (response.status === 200) {
					resolve()
				} else {
					reject(response.status)
				}
			})
		})
}

module.exports = Authenticator