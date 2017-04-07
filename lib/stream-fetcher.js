const fetch = require('node-fetch')
const memoize = require('memoizee')

const MAX_AGE = 15 * 60 * 1000 // 15 minutes

function StreamFetcher(baseUrl) {
	this.streamResourceUrl = baseUrl + '/api/v1/streams'
	this.authenticate = memoize(StreamFetcher.prototype._authenticate, {
		maxAge: MAX_AGE
	})
	this.authenticatedFetch = memoize(StreamFetcher.prototype._authenticatedFetch, {
		maxAge: MAX_AGE
	})
}

// TODO: expire cache item if stream changed / key compromised.
StreamFetcher.prototype._authenticatedFetch = function(streamId, authKey) {
	const _this = this

	const headers = {}
	if (authKey) {
		headers['Authorization'] = 'token ' + authKey
	}

	return fetch(_this.streamResourceUrl + '/' + streamId, { headers: headers }).then(function(response) {
		return new Promise(function(resolve, reject) {
			if (response.status === 200) {
				resolve(response.json())
			} else {
				reject(response.status)
			}
		})
	})
}

StreamFetcher.prototype._authenticate = function(streamId, authKey, operation) {
	const _this = this

	const headers = {}
	if (authKey) {
		headers['Authorization'] = 'token ' + authKey
	}

	return fetch(_this.streamResourceUrl + '/' + streamId + '/permissions/me', { headers: headers }).then(function(response) {
		return new Promise(function(resolve, reject) {
			if (response.status === 200) {
				response.json().then(function(permissions) {
					for (var i=0; i < permissions.length; ++i) {
						if (permissions[i].operation === operation) {
							resolve(true)
							return
						}
					}
					reject(403)
				})
			} else {
				reject(response.status)
			}
		})
	})
}

module.exports = StreamFetcher