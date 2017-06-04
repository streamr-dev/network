'use strict'

/**
 * Middleware used to authenticate REST API requests
 */
module.exports = function(streamFetcher) {
	return function (req, res, next) {
		if (req.headers.authorization === undefined) {
			res.status(400).send({
				error: 'Header "Authorization" required.'
			})
		} else if (!req.headers.authorization.toLowerCase().startsWith('token')) {
			res.status(400).send({
				error: 'Authorization header malformed. Should be of form "token authKey".'
			})
		} else {
			const authKey = req.headers.authorization
				.substring(5)
				.trim()
			streamFetcher.authenticate(req.id, authKey, 'READ')
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
}