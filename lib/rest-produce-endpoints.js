const StreamrBinaryMessage = require('./protocol/StreamrBinaryMessage')
const debug = require('debug')("produce handler")

const tokenRegex = /^token (.*)$/i

/**
 * Endpoints for POSTing data to streams
 */
module.exports = function(app, streamFetcher, kafka, partitioner) {
	if (!app) {
		throw 'No express app given!'
	}
	if (!streamFetcher) {
		throw "No StreamFetcher given! Must use: new StreamrDataApi(streamrUrl)"
	}
	if (!kafka) {
		throw "No StreamrKafkaProducer given! Must use: new StreamrDataApi(authenticator, kafka)"
	}
	if (!partitioner) {
		throw "Partitioner not given!"
	}

	let kafkaReady = false
	kafka.on('ready', function() {
		kafkaReady = true
		debug("Kafka is ready")
	})

	return function (req, res) {
		if (!req.body) {
			res.status(400).send('No request body or invalid request body.')
			return
		}

		var ttl = 0
		if (req.query.ttl) {
			ttl = Number(req.query.ttl)
			if (!ttl) {
				res.status(400).send('Invalid ttl: ' + req.query.ttl)
				return
			}
		}

		var authorization = req.get("Authorization")
		var key
		if (authorization) {
			var matches = authorization.match(tokenRegex)
			if (!matches) {
				res.status(400).send('Invalid Authorization header. Expected form: "token your-key". It was: '+authorization);
				return
			} else {
				key = matches[1]
			}
		}

		debug("Authenticating request: id %s, key %s", req.params.id, key)
		streamFetcher.authenticate(req.params.id, key, 'write').then(function() {
			return streamFetcher.authenticatedFetch(req.params.id, key)
		}).then(function(stream) {
			var streamPartition = partitioner.partition(stream.partitions, req.query.pkey)

			if (!kafkaReady) {
				console.error("Kafka not ready")
				res.status(503).send('Server instance not ready to produce, please try again')
			} else {
				kafka.send(new StreamrBinaryMessage(req.params.id, streamPartition, new Date(), ttl, StreamrBinaryMessage.CONTENT_TYPE_JSON, req.body),
					function (err) {
						if (err) {
							console.error("Producing to Kafka failed: ", err)
							res.status(500).send('Internal error, sorry')
						} else {
							res.status(200).send()
						}
					})
			}
		}).catch(function(statusCode) {
			if (statusCode === 404) {
				console.log('Stream ' + req.params.id + ' was not found')
				res.status(404).send('Stream not found: ' + req.params.id)
			} else if (statusCode === 403) {
				console.log("Auth failed for stream " + req.params.id + ", auth " + key)
				res.status(403).send('Authentication failed')
			} else {
				res.status(statusCode).send('Failed')
			}
		})
	}
}
