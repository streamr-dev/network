const fetch = require('node-fetch')

function Authenticator(baseUrl) {
	this.url = baseUrl + "/api/v1/permissions/authenticate"
}

Authenticator.prototype.authenticate = function(streamId, authKey, operation) {
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