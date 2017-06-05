const assert = require('assert')
const express = require('express')
const request = require('supertest')
const sinon = require('sinon')
const restEndpointRouter = require('../lib/rest-endpoints')

describe('RestEndpoints', function() {
	let app
	let historicalAdapterStub
	let streamFetcher

	function testGetRequest(url, key = 'authKey') {
		return request(app)
			.get(url)
			.set('Accept', 'application/json')
			.set('Authorization', `Token ${key}`)
	}

	beforeEach(function() {
		app = express()
		historicalAdapterStub = {}
		streamFetcher = {
			authenticate(streamId, authKey, operation) {
				return new Promise(function(resolve, reject) {
					if (authKey === 'authKey') {
						resolve({})
					} else {
						reject("Authentication failed!")
					}
				})
			}
		}
		app.use('/api/v1', restEndpointRouter(historicalAdapterStub, streamFetcher))
	})

	describe('GET /api/v1/streams/streamId/data/partitions/0/last', function() {
		beforeEach(function() {
			historicalAdapterStub.getLast = function (stream, streamPartition, count, msgHandler, doneCallback) {
				msgHandler({ hello: 1 })
				msgHandler({ world: 2 })
				doneCallback(null, null)
			}
		})

		context('user errors', function() {
			it('responds 400 and error message if param "partition" not a number', function(done) {
				testGetRequest('/api/v1/streams/streamId/data/partitions/zero/last')
					.expect('Content-Type', /json/)
					.expect(400, { error: 'Path parameter "partition" not a number: zero' }, done)
			})

			it('responds 403 and error message if not authorized', function(done) {
				testGetRequest('/api/v1/streams/streamId/data/partitions/0/last', 'wrongKey')
					.expect('Content-Type', /json/)
					.expect(403, { error: 'Authentication failed.' }, done)
			})

			it('responds 400 and error message if optional param "count" not a number', function(done) {
				testGetRequest('/api/v1/streams/streamId/data/partitions/0/last?count=sixsixsix')
					.expect('Content-Type', /json/)
					.expect(400, { error: 'Query parameter "count" not a number: sixsixsix' }, done)
			})
		})

		context('/', function() {
			it('responds 200 and Content-Type JSON', function(done) {
				testGetRequest('/api/v1/streams/streamId/data/partitions/0/last')
					.expect('Content-Type', /json/)
					.expect(200, done)
			})

			it('responds with data points as body', function(done) {
				testGetRequest('/api/v1/streams/streamId/data/partitions/0/last')
					.expect([{ hello: 1 }, { world: 2 }], done)
			})

			it('invokes historicalAdapter#getLast once with correct arguments', function(done) {
				sinon.spy(historicalAdapterStub, 'getLast')

				testGetRequest('/api/v1/streams/streamId/data/partitions/0/last')
					.then(function(res) {
						sinon.assert.calledOnce(historicalAdapterStub.getLast)
						sinon.assert.calledWith(historicalAdapterStub.getLast, 'streamId', 0, 1)
						done()
					})
					.catch(done)
			})

			it('responds 500 and error message if historicalDataAdapter signals error', function(done) {
				historicalAdapterStub.getLast = function (stream, streamPartition, count, msgHandler, doneCallback) {
					doneCallback(null, { error: 'error '})
				}

				testGetRequest('/api/v1/streams/streamId/data/partitions/0/last')
					.expect('Content-Type', /json/)
					.expect(500, { error: 'Failed to fetch data!' }, done)
			})
		})

		context('?count=666', function() {
			it('passes count to historicalAdapter#getLast', function(done) {
				sinon.spy(historicalAdapterStub, 'getLast')

				testGetRequest('/api/v1/streams/streamId/data/partitions/0/last?count=666')
					.then(function(res) {
						sinon.assert.calledOnce(historicalAdapterStub.getLast)
						sinon.assert.calledWith(historicalAdapterStub.getLast, 'streamId', 0, 666)
						done()
					})
					.catch(done)
			})
		})
	})

	describe('GET /api/v1/streams/streamId/data/partitions/0/range', function() {
		beforeEach(function() {
			historicalAdapterStub.getFromOffset = function(stream, partition, from, msgHandler, doneCallback) {
				msgHandler({ hello: 1 })
				msgHandler({ world: 2 })
				msgHandler({ beast: 666 })
				doneCallback(null, null)
			}

			historicalAdapterStub.getOffsetRange = function(stream, partition, from, to, msgHandler, doneCallback) {
				msgHandler({ test: 1234 })
				doneCallback(null, null)
			}

			historicalAdapterStub.getFromTimestamp = function(stream, partition, from, msgHandler, doneCallback) {
				msgHandler({ a: 'a' })
				msgHandler({ z: 'z' })
				doneCallback(null, null)
			}
			historicalAdapterStub.getTimestampRange = function(stream, partition, from, to, msgHandler, doneCallback) {
				msgHandler([6, 6, 6])
				msgHandler({ '6': '6' })
				doneCallback(null, null)
			}
		})

		context('user errors', function() {
			it('responds 400 and error message if param "partition" not a number', function(done) {
				testGetRequest('/api/v1/streams/streamId/data/partitions/zero/range')
					.expect('Content-Type', /json/)
					.expect(400, { error: 'Path parameter "partition" not a number: zero' }, done)
			})

			it('responds 403 and error message if not authorized', function(done) {
				testGetRequest('/api/v1/streams/streamId/data/partitions/0/range', 'wrongKey')
					.expect('Content-Type', /json/)
					.expect(403, { error: 'Authentication failed.' }, done)
			})

			it('responds 400 and error message if param "fromOffset" not a number', function(done) {
				testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromOffset=numberOfTheBeast')
					.expect('Content-Type', /json/)
					.expect(400, { error: 'Query parameter "fromOffset" not a number: numberOfTheBeast' }, done)
			})

			it('responds 400 and error message if param "fromTimestamp" not a number', function(done) {
				testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=endOfTime')
					.expect('Content-Type', /json/)
					.expect(400, { error: 'Query parameter "fromTimestamp" not a number: endOfTime' }, done)
			})

			it('responds 400 and error message if optional param "toOffset" not a number', function(done) {
				testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromOffset=1&toOffset=sixsixsix')
					.expect('Content-Type', /json/)
					.expect(400, { error: 'Query parameter "toOffset" not a number: sixsixsix' }, done)
			})

			it('responds 400 and error message if optional param "toTimestamp" not a number', function(done) {
				testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromOffset=1&toTimestamp=endOfLife')
					.expect('Content-Type', /json/)
					.expect(400, { error: 'Query parameter "toTimestamp" not a number: endOfLife' }, done)
			})

			it('responds 400 and error message if param "fromOffset" or "fromTimestamp" not given', function(done) {
				testGetRequest('/api/v1/streams/streamId/data/partitions/0/range')
					.expect('Content-Type', /json/)
					.expect(400, { error: 'Query parameter "fromOffset" or "fromTimestamp" required.' }, done)
			})

			it('responds 400 and error message if both params "fromOffset" and "fromTimestamp" given', function(done) {
				testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromOffset=2&fromTimestamp=1')
					.expect('Content-Type', /json/)
					.expect(400, { error: 'Query parameters "fromOffset" and "fromTimestamp" cannot be used simultaneously.' }, done)
			})

			it('responds 400 and error message if both optional params "toOffset" and "toTimestamp" given', function(done) {
				testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromOffset=1&toOffset=15&toTimestamp=1321525')
					.expect('Content-Type', /json/)
					.expect(400, { error: 'Query parameters "toOffset" and "toTimestamp" cannot be used simultaneously.' }, done)
			})

			it('responds 400 and error message if param "fromOffset" used with "toTimestamp"', function(done) {
				testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromOffset=1&toTimestamp=1321525')
					.expect('Content-Type', /json/)
					.expect(400, { error: 'Using query parameters "fromOffset" and "toTimestamp" together is not yet supported.' }, done)
			})

			it('responds 400 and error message if param "fromTimestamp" used with "toOffset"', function(done) {
				testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=13215215215&toOffset=666')
					.expect('Content-Type', /json/)
					.expect(400, { error: 'Using query parameters "fromTimestamp" and "toOffset" together is not yet supported.' }, done)
			})
		})

		context('?fromOffset=15', function() {
			it('responds 200 and Content-Type JSON', function(done) {
				testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromOffset=15')
					.expect('Content-Type', /json/)
					.expect(200, done)
			})

			it('responds with data points as body', function(done) {
				testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromOffset=15')
					.expect([{ hello: 1 }, { world: 2 }, { beast: 666 }], done)
			})

			it('invokes historicalAdapter#getFromOffset once with correct arguments', function(done) {
				sinon.spy(historicalAdapterStub, 'getFromOffset')

				testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromOffset=15')
					.then(function(res) {
						sinon.assert.calledOnce(historicalAdapterStub.getFromOffset)
						sinon.assert.calledWith(historicalAdapterStub.getFromOffset, 'streamId', 0, 15)
						done()
					})
					.catch(done)
			})

			it('responds 500 and error message if historicalDataAdapter signals error', function(done) {
				historicalAdapterStub.getFromOffset = function (stream, partition, from, msgHandler, doneCallback) {
					doneCallback(null, { error: 'error '})
				}

				testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromOffset=15')
					.expect('Content-Type', /json/)
					.expect(500, { error: 'Failed to fetch data!' }, done)
			})
		})

		context('?fromOffset=15&toOffset=8196', function() {
			it('responds 200 and Content-Type JSON', function(done) {
				testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromOffset=15&toOffset=8196')
					.expect('Content-Type', /json/)
					.expect(200, done)
			})

			it('responds with data points as body', function(done) {
				testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromOffset=15&toOffset=8196')
					.expect([{ test: 1234 }], done)
			})

			it('invokes historicalAdapter#getOffsetRange once with correct arguments', function(done) {
				sinon.spy(historicalAdapterStub, 'getOffsetRange')

				testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromOffset=15&toOffset=8196')
					.then(function(res) {
						sinon.assert.calledOnce(historicalAdapterStub.getOffsetRange)
						sinon.assert.calledWith(historicalAdapterStub.getOffsetRange, 'streamId', 0, 15, 8196)
						done()
					})
					.catch(done)
			})

			it('responds 500 and error message if historicalDataAdapter signals error', function(done) {
				historicalAdapterStub.getOffsetRange = function (stream, partition, from, to, msgHandler, doneCb) {
					doneCb(null, { error: 'error '})
				}

				testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromOffset=15&toOffset=8196')
					.expect('Content-Type', /json/)
					.expect(500, { error: 'Failed to fetch data!' }, done)
			})
		})

		context('?fromTimestamp=1496408255672', function() {
			it('responds 200 and Content-Type JSON', function(done) {
				testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672')
					.expect('Content-Type', /json/)
					.expect(200, done)
			})

			it('responds with data points as body', function(done) {
				testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672')
					.expect([{ a: "a" }, { z: "z" }], done)
			})

			it('invokes historicalAdapter#getFromTimestamp once with correct arguments', function(done) {
				sinon.spy(historicalAdapterStub, 'getFromTimestamp')

				testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672')
					.then(function(res) {
						sinon.assert.calledOnce(historicalAdapterStub.getFromTimestamp)
						sinon.assert.calledWith(historicalAdapterStub.getFromTimestamp, 'streamId', 0,
							new Date(1496408255672))
						done()
					})
					.catch(done)
			})

			it('responds 500 and error message if historicalDataAdapter signals error', function(done) {
				historicalAdapterStub.getFromTimestamp = function (stream, partition, from, msgHandler, doneCallback) {
					doneCallback(null, { error: 'error '})
				}

				testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672')
					.expect('Content-Type', /json/)
					.expect(500, { error: 'Failed to fetch data!' }, done)
			})
		})

		context('?fromTimestamp=1496408255672&toTimestamp=1496415670909', function() {
			it('responds 200 and Content-Type JSON', function(done) {
				testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672&toTimestamp=1496415670909')
					.expect('Content-Type', /json/)
					.expect(200, done)
			})

			it('responds with data points as body', function(done) {
				testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672&toTimestamp=1496415670909')
					.expect([[6, 6, 6], {6 : "6"}], done)
			})

			it('invokes historicalAdapter#getTimestampRange once with correct arguments', function(done) {
				sinon.spy(historicalAdapterStub, 'getTimestampRange')

				testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672&toTimestamp=1496415670909')
					.then(function(res) {
						sinon.assert.calledOnce(historicalAdapterStub.getTimestampRange)
						sinon.assert.calledWith(historicalAdapterStub.getTimestampRange, 'streamId', 0,
							new Date(1496408255672), new Date(1496415670909))
						done()
					})
					.catch(done)
			})

			it('responds 500 and error message if historicalDataAdapter signals error', function(done) {
				historicalAdapterStub.getTimestampRange = function (stream, streamPartition, from, to, msgHandler, doneCallback) {
					doneCallback(null, { error: 'error '})
				}

				testGetRequest('/api/v1/streams/streamId/data/partitions/0/range?fromTimestamp=1496408255672&toTimestamp=1496415670909')
					.expect('Content-Type', /json/)
					.expect(500, { error: 'Failed to fetch data!' }, done)
			})
		})
	})
})