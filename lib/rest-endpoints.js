/**
 * Endpoints for RESTful data requests
 * TODO: unit tests
 */
module.exports = function(app, historicalAdapter) {

	app.get('/api/v1/streams/:id/:partition/data/last/:count?', function(req, res) {
		var dataPoints = []
		historicalAdapter.getLast(
			req.params.id,
			parseInt(req.params.partition),
			parseInt(req.params.count) || 1,
			// msg handler
			function (dataPoint) {
				dataPoints.push(dataPoint)
			},
			// done handler
			function (largestOffset, err) {
				if (err) {
					console.log("Error: ", err)
					res.status(500).send({error: 'Failed to get data!'});
				}
				else {
					res.send(dataPoints)
				}
			})
	})

	app.get('/api/v1/streams/:id/:partition/data/fromOffset/:offset', function(req, res) {
		var dataPoints = []

		var fromOffset = parseInt(req.params.fromOffset)

		if (fromOffset === Number.NaN) {
			res.status(500).send({ error: 'Invalid start offset: '+req.params.fromOffset });
		}
		else {
			historicalAdapter.getFromOffset(
				req.params.id,
				parseInt(req.params.partition),
				parseInt(req.params.offset) || Number.MAX_SAFE_INTEGER,
				// msg handler
				function (dataPoint) {
					dataPoints.push(dataPoint)
				},
				// done handler
				function (largestOffset, err) {
					if (err) {
						console.log("Error: ", err)
						res.status(500).send({error: 'Failed to get data!'});
					}
					else {
						res.send(dataPoints)
					}
				}
			)
		}
	})

	app.get('/api/v1/streams/:id/:partition/data/fromOffset/:fromOffset/toOffset/:toOffset', function(req, res) {
		var dataPoints = []

		var fromOffset = parseInt(req.params.fromOffset)
		var toOffset = parseInt(req.params.toOffset)

		if (fromOffset === Number.NaN) {
			res.status(500).send({ error: 'Invalid start offset: '+req.params.fromOffset });
		}
		else if (toOffset == Number.NaN) {
			res.status(500).send({ error: 'Invalid end offset: '+req.params.toOffset});
		}
		else {
			historicalAdapter.getOffsetRange(
				req.params.id,
				parseInt(req.params.partition),
				fromOffset,
				toOffset,
				// msg handler
				function (dataPoint) {
					dataPoints.push(dataPoint)
				},
				// done handler
				function (largestOffset, err) {
					if (err) {
						console.log("Error: ", err)
						res.status(500).send({error: 'Failed to get data!'});
					}
					else {
						res.send(dataPoints)
					}
				}
			)
		}
	})

	app.get('/api/v1/streams/:id/:partition/data/fromTimestamp/:timestamp', function(req, res) {
		var dataPoints = []

		var timestamp = parseInt(req.params.timestamp)

		if (timestamp === Number.NaN) {
			res.status(500).send({ error: 'Invalid start timestamp: '+req.params.timestamp });
		}
		else {
			historicalAdapter.getFromTimestamp(
				req.params.id,
				parseInt(req.params.partition),
				new Date(timestamp),
				// msg handler
				function (dataPoint) {
					dataPoints.push(dataPoint)
				},
				// done handler
				function (largestOffset, err) {
					if (err) {
						console.log("Error: ", err)
						res.status(500).send({error: 'Failed to get data!'});
					}
					else {
						res.send(dataPoints)
					}
				}
			)
		}
	})

	app.get('/api/v1/streams/:id/:partition/data/fromTimestamp/:fromTimestamp/toTimestamp/:toTimestamp', function(req, res) {
		var dataPoints = []

		var fromTimestamp = parseInt(req.params.fromTimestamp)
		var toTimestamp = parseInt(req.params.toTimestamp)

		if (fromTimestamp === Number.NaN) {
			res.status(500).send({ error: 'Invalid start timestamp: '+req.params.fromTimestamp });
		}
		else if (toTimestamp == Number.NaN) {
			res.status(500).send({ error: 'Invalid end timestamp: '+req.params.toTimestamp});
		}
		else {
			historicalAdapter.getTimestampRange(
				req.params.id,
				parseInt(req.params.partition),
				new Date(fromTimestamp),
				new Date(toTimestamp),
				// msg handler
				function (dataPoint) {
					dataPoints.push(dataPoint)
				},
				// done handler
				function (largestOffset, err) {
					if (err) {
						console.log("Error: ", err)
						res.status(500).send({error: 'Failed to get data!'});
					}
					else {
						res.send(dataPoints)
					}
				}
			)
		}
	})
}