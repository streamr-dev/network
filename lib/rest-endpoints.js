/**
 * Endpoints for RESTful data requests
 */
const express = require('express')
const authenticationMiddleware = require('./authentication-middleware')

module.exports = function(historicalAdapter, streamFetcher) {
	const router = express.Router()

	router.use('/streams/:id/data/partitions/:partition',
		function(req, res, next) {
			const partitionAsNum = parseInt(req.params.partition)

			if (isNaN(partitionAsNum)) {
				res.status(400).send({
					error: 'Path parameter "partition" not a number: ' + req.params.partition
				})
			} else {
				req.id = req.params.id
				req.partition = partitionAsNum
				next()
			}
		},
		authenticationMiddleware(streamFetcher)
	)

	router.get('/streams/:id/data/partitions/:partition/last', function (req, res) {
		const id = req.id
		const partition = req.partition
		const count = req.query.count === undefined ? 1 : parseInt(req.query.count)

		if (isNaN(count)) {
			res.status(400).send({
				error: 'Query parameter "count" not a number: ' + req.query.count
			})
		} else {
			const dataPoints = []
			historicalAdapter.getLast(
				id,
				partition,
				count,
				dataPoints.push.bind(dataPoints),
				onDataFetchDone(res, dataPoints)
			)
		}
	})

	router.get('/streams/:id/data/partitions/:partition/range', function (req, res) {
		const id = req.id
		const partition = req.partition
		const fromOffset = parseIntIfExists(req.query.fromOffset)
		const toOffset = parseIntIfExists(req.query.toOffset)
		const fromTimestamp = parseIntIfExists(req.query.fromTimestamp)
		const toTimestamp = parseIntIfExists(req.query.toTimestamp)

		if (fromOffset !== undefined && isNaN(fromOffset)) {
			res.status(400).send({
				error: 'Query parameter "fromOffset" not a number: ' + req.query.fromOffset
			})
		} else if (fromTimestamp !== undefined && isNaN(fromTimestamp)) {
			res.status(400).send({
				error: 'Query parameter "fromTimestamp" not a number: ' + req.query.fromTimestamp
			})
		} else if (toOffset !== undefined && isNaN(toOffset)) {
			res.status(400).send({
				error: 'Query parameter "toOffset" not a number: ' + req.query.toOffset
			})
		} else if (toTimestamp !== undefined && isNaN(toTimestamp)) {
			res.status(400).send({
				error: 'Query parameter "toTimestamp" not a number: ' + req.query.toTimestamp
			})
		} else if (fromOffset === undefined && fromTimestamp === undefined) {
			res.status(400).send({
				error: 'Query parameter "fromOffset" or "fromTimestamp" required.'
			})
		} else if (fromOffset !== undefined && fromTimestamp !== undefined) {
			res.status(400).send({
				error: 'Query parameters "fromOffset" and "fromTimestamp" cannot be used simultaneously.'
			})
		} else if (toOffset !== undefined && toTimestamp !== undefined) {
			res.status(400).send({
				error: 'Query parameters "toOffset" and "toTimestamp" cannot be used simultaneously.'
			})
		} else if (fromOffset !== undefined && toTimestamp !== undefined) {
			res.status(400).send({
				error: 'Using query parameters "fromOffset" and "toTimestamp" together is not yet supported.'
			})
		} else if (fromTimestamp !== undefined && toOffset !== undefined) {
			res.status(400).send({
				error: 'Using query parameters "fromTimestamp" and "toOffset" together is not yet supported.'
			})
		} else {
			const dataPoints = []

			if (fromOffset !== undefined && toOffset === undefined) {
				historicalAdapter.getFromOffset(
					id,
					partition,
					fromOffset,
					dataPoints.push.bind(dataPoints),
					onDataFetchDone(res, dataPoints)
				)
			} else if (fromOffset !== undefined && toOffset !== undefined) {
				historicalAdapter.getOffsetRange(
					id,
					partition,
					fromOffset,
					toOffset,
					dataPoints.push.bind(dataPoints),
					onDataFetchDone(res, dataPoints)
				)
			} else if (toTimestamp === undefined) {
				historicalAdapter.getFromTimestamp(
					id,
					partition,
					new Date(fromTimestamp),
					dataPoints.push.bind(dataPoints),
					onDataFetchDone(res, dataPoints)
				)
			} else {
				historicalAdapter.getTimestampRange(
					id,
					partition,
					new Date(fromTimestamp),
					new Date(toTimestamp),
					dataPoints.push.bind(dataPoints),
					onDataFetchDone(res, dataPoints)
				)
			}
		}
	})

	return router
}

function onDataFetchDone(res, dataPoints) {
	return function(largestOffset, err) {
		if (err) {
			console.log(err)
			res.status(500).send({
				error: 'Failed to fetch data!'
			})
		} else {
			res.send(dataPoints)
		}
	}
}

function parseIntIfExists(x) {
	return x === undefined ? undefined : parseInt(x)
}