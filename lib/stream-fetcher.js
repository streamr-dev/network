const fetch = require('node-fetch')
const memoize = require('memoizee')
const debug = require('debug')('StreamFetcher')

const MAX_AGE = 15 * 60 * 1000 // 15 minutes

function StreamFetcher(baseUrl) {
	this.streamResourceUrl = baseUrl + '/api/v1/streams'
	this.fetch = memoize(StreamFetcher.prototype._fetch, {
		maxAge: MAX_AGE
	})
	this.checkPermission = memoize(StreamFetcher.prototype._checkPermission, {
		maxAge: MAX_AGE
	})
}

// TODO: expire cache item if stream changed / key compromised.

/**
 * Returns a Promise that resolves with the stream json. Fails if there is no read permission.
 *
 * @param streamId
 * @param authKey
 * @returns {Promise.<TResult>}
 * @private
 */
StreamFetcher.prototype._fetch = function(streamId, authKey) {
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
				debug('fetch failed with status %d for streamId %s key %s: %o', response.status, streamId, authKey, response.json())
				_this.fetch.delete(streamId, authKey) // clear cache result
				reject(response.status)
			}
		})
	})
}

/**
 * Retrieves permissions to a stream, and checks if a permission is granted for the requested operation.
 * Promise always resolves to true.
 *
 * @param streamId
 * @param authKey
 * @param operation
 * @returns {Promise}
 * @private
 */
StreamFetcher.prototype._checkPermission = function(streamId, authKey, operation = 'read') {
	const _this = this

	const headers = {}
	if (authKey) {
		headers['Authorization'] = 'token ' + authKey
	}

	return new Promise((resolve, reject) => {
		return fetch(_this.streamResourceUrl + '/' + streamId + '/permissions/me', { headers: headers }).then(function(response) {
			if (response.status === 200) {
				response.json().then(function(permissions) {
					let found = false
					for (let i=0; i < permissions.length; ++i) {
						if (permissions[i].operation === operation) {
							found = true
							break
						}
					}
					if (found) {
						resolve(true)
					} else {
						debug('checkPermission failed for streamId %s key %s operation %s. permissions were: %o', streamId, authKey, operation, permissions)
						reject(403)
					}
				})
			} else {
				response.text().then(function(errorMsg) {
					debug('checkPermission failed with status %d for streamId %s key %s operation %s: %s', response.status, streamId, authKey, operation, errorMsg)
				})
				_this.checkPermission.delete(streamId, authKey, operation) // clear cache result
				reject(response.status)
			}
		})
	})
}

StreamFetcher.prototype.authenticate = function(streamId, authKey, operation = 'read') {
	if (operation === 'read') {
		// No need to explicitly check permissions, as fetch will fail if no read permission
		return this.fetch(streamId, authKey)
	} else {
		return this.checkPermission(streamId, authKey, operation).then(() => {
			return this.fetch(streamId, authKey)
		})
	}
}

module.exports = StreamFetcher