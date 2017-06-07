const express = require('express')
const bodyParser = require('body-parser')
const debug = require('debug')("produce handler")
const authenticationMiddleware = require('./authentication-middleware')
const StreamrBinaryMessage = require('./protocol/StreamrBinaryMessage')

/**
 * Endpoint for POSTing data to streams
 */
module.exports = function(streamFetcher, kafka, partitioner) {
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

	const router = express.Router()

	router.post('/streams/:id/data',
		// Disable automatic body parsing and increase body size limit (body becomes available as Buffer)
		bodyParser.raw({
			limit: '1024kb',
			type: function() { return true }
		}),
		// Check write permission using middleware, writes req.stream
		authenticationMiddleware(streamFetcher, 'write'),
		// Produce request handler
		function (req, res) {
			if (!req.body || !req.body.length) {
				res.status(400).send({
					error: 'No request body or invalid request body.'
				})
				return
			}

			var ttl = 0
			if (req.query.ttl) {
				ttl = Number(req.query.ttl)
				if (!ttl) {
					res.status(400).send({
						error: 'Invalid ttl: ' + req.query.ttl
					})
					return
				}
			}

			var stream = req.stream // written by authentication middleware
			var streamPartition = partitioner.partition(stream.partitions, req.query.pkey)

			if (!kafkaReady) {
				console.error("Kafka not ready")
				res.status(503).send({
					error: 'Server instance not ready to produce, please try again'
				})
			} else {
				kafka.send(new StreamrBinaryMessage(req.params.id, streamPartition, new Date(), ttl, StreamrBinaryMessage.CONTENT_TYPE_JSON, req.body),
					function (err) {
						if (err) {
							console.error("Producing to Kafka failed: ", err)
							res.status(500).send({
								error: 'Internal error, sorry'
							})
						} else {
							res.status(200).send()
						}
					})
			}
	})

	return router
}
