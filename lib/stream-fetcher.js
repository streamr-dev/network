const fetch = require('node-fetch')
const memoize = require('memoizee')

const MAX_AGE = 24 * 60 * 60 * 1000 // 24 hours

function StreamFetcher(baseUrl) {
	this.streamResourceUrl = baseUrl + '/api/v1/streams'
	this.authenticatedFetch = memoize(StreamFetcher.prototype._authenticatedFetch, {
		maxAge: MAX_AGE
	})
}

// TODO: expire cache item if stream changed / key compromised.

StreamFetcher.prototype._authenticatedFetch = function(streamId, authKey) {
	const _this = this

	return fetch(_this.streamResourceUrl + '/' + streamId, {
		headers: {
			Authorization: 'token ' + authKey
		}
	}).then(function(response) {
		return new Promise(function(resolve, reject) {
			if (response.status === 200) {
				resolve(response.json())
			} else {
				reject(response.status)
			}
		})
	})
}

module.exports = StreamFetcher