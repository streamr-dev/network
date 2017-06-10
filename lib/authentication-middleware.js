'use strict'

/**
 * Middleware used to authenticate REST API requests
 */
module.exports = function(streamFetcher, permission) {
	permission = permission || 'read'

	return function (req, res, next) {
		let authKey

		// Try to parse authorization header if defined
		if (req.headers.authorization !== undefined) {
			if (!req.headers.authorization.toLowerCase().startsWith('token')) {
				res.status(400).send({
					error: 'Authorization header malformed. Should be of form "token authKey".'
				})
				return
			} else {
				authKey = req.headers.authorization
					.substring(5)
					.trim()
			}
		}

		streamFetcher.authenticate(req.params.id, authKey, permission)
			.then(function(streamJson) {
				req.stream = streamJson
				next()
			})
			.catch(function(err) {
				console.error(err)
				res.status(403).send({
					error: 'Authentication failed.'
				})
			})
	}
}