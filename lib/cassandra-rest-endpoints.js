/**
 * Endpoints for RESTful data requests
 */
module.exports = function(app, cassandra) {
	app.get('/api/v1/streams/:id/:partition/data/last/:count?', function(req, res) {
		var dataPoints = []

		cassandra.getLast(req.params.id, parseInt(req.params.partition), parseInt(req.params.count) || 1, function(dataPoint) {
				dataPoints.push(dataPoint)
			},
			function(err) {
				if (err) {
					console.log("Error: ", err)
					res.status(500).send({ error: 'Failed to get data!' });
				}
				else {
					res.send(dataPoints)
				}
			})
	});

	app.get('/api/v1/streams/:id/:partition/data/fromOffset/:offset', function(req, res) {
		var dataPoints = []

		var fromOffset = parseInt(req.params.fromOffset)

		if (fromOffset === Number.NaN) {
			res.status(500).send({ error: 'Invalid start offset: '+req.params.fromOffset });
		}
		else {
			cassandra.getFromOffset(req.params.id, parseInt(req.params.partition), parseInt(req.params.offset) || Number.MAX_SAFE_INTEGER, function (dataPoint) {
					dataPoints.push(dataPoint)
				},
				function (err) {
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
	});

	app.get('/api/v1/streams/:id/:partition/data/offsetRange/:fromOffset/to/:toOffset', function(req, res) {
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
			cassandra.getOffsetRange(req.params.id, parseInt(req.params.partition), fromOffset, toOffset, function (dataPoint) {
					dataPoints.push(dataPoint)
				},
				function (err) {
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
	});

	app.get('/api/v1/streams/:id/:partition/data/fromTimestamp/:timestamp', function(req, res) {
		var dataPoints = []

		var timestamp = parseInt(req.params.timestamp)

		if (timestamp === Number.NaN) {
			res.status(500).send({ error: 'Invalid start timestamp: '+req.params.timestamp });
		}
		else {
			cassandra.getFromTimestamp(req.params.id, parseInt(req.params.partition), new Date(timestamp), function (dataPoint) {
					dataPoints.push(dataPoint)
				},
				function (err) {
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
	});

	app.get('/api/v1/streams/:id/:partition/data/timestampRange/:fromTimestamp/to/:toTimestamp', function(req, res) {
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
			cassandra.getTimestampRange(req.params.id, parseInt(req.params.partition), new Date(fromTimestamp), new Date(toTimestamp), function (dataPoint) {
					dataPoints.push(dataPoint)
				},
				function (err) {
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
	});
}