const assert = require('assert')
const express = require('express')
const sinon = require('sinon')
const StreamFetcher = require('../lib/stream-fetcher')

describe('StreamFetcher', function () {

	var streamFetcher
	var expressApp
	var server
	var numOfRequests
	var broken

	beforeEach(function(done) {
		numOfRequests = 0
		broken = false

		// Create fake server endpoint for testing purposes
		expressApp = express()

		expressApp.get('/api/v1/streams/:id/permissions/me', function(req, res) {
			numOfRequests += 1
			if (broken) {
				res.sendStatus(500)
			} else if (req.params.id !== 'streamId') {
				res.sendStatus(404)
			} else if (req.get('Authorization') !== 'token key') {
				res.sendStatus(403)
			} else {
				res.status(200).send([
					{
						"id": null,
						"user": "tester1@streamr.com",
						"operation": "read"
					}
				])
			}
		})

		expressApp.get('/api/v1/streams/:id', function(req, res) {
			numOfRequests += 1
			if (broken) {
				res.sendStatus(500)
			} else if (req.params.id !== 'streamId') {
				res.sendStatus(404)
			} else if (req.get('Authorization') !== 'token key') {
				res.sendStatus(403)
			} else {
				res.status(200).send({
					id: 'streamId',
					partitions: 1,
					name: 'example stream',
					description: 'a stream used inside test',
					feed: {
						id: 'feedId',
						name: 'feedName',
						module: 7
					},
					config: {}
				})
			}
		})

		server = expressApp.listen(6194, function() {
			console.info('Server started on port 6194\n')
			done()
		})

		streamFetcher = new StreamFetcher('http://127.0.0.1:6194')
	})

	afterEach(function() {
		server.close()
	})

	describe('authenticate', function() {
		it('returns Promise', function() {
			assert(streamFetcher.authenticate('streamId', 'key', 'read') instanceof Promise)
		})

		it('rejects with 404 if stream does not exist', function(done) {
			streamFetcher.authenticate('nonExistingStreamId', 'key', 'read').catch(function(code) {
				assert.equal(code, 404)
				done()
			})
		})

		it('rejects with 403 if key does not grant access to stream', function(done) {
			streamFetcher.authenticate('streamId', 'nonExistantKey', 'read').catch(function(code) {
				assert.equal(code, 403)
				done()
			})
		})

		it('rejects with 403 if key does not provides (desired level) privilege to stream', function(done) {
			streamFetcher.authenticate('streamId', 'key', 'write').catch(function(code) {
				assert.equal(code, 403)
				done()
			})
		})

		it('resolves with true if key provides privilege to stream', function(done) {
			streamFetcher.authenticate('streamId', 'key', 'read').then(function(response) {
				assert.equal(response, true)
				done()
			}).catch(function(err) {
				done(err)
			})
		})

		it('caches repeated invocations', function(done) {
			Promise.all([streamFetcher.authenticate('streamId', 'key', 'read'),
				streamFetcher.authenticate('streamId', 'key', 'read'),
				streamFetcher.authenticate('streamId', 'key', 'read'),
				streamFetcher.authenticate('streamId2', 'key', 'read'),
				streamFetcher.authenticate('streamId', 'key', 'read'),
				streamFetcher.authenticate('streamId2', 'key', 'read'),
				streamFetcher.authenticate('streamId2', 'key', 'read'),
				streamFetcher.authenticate('streamId2', 'key', 'read')
			]).catch(function() {
				assert.equal(numOfRequests, 2)
				done()
			})
		})

		it('does not cache errors', function (done) {
			broken = true
			streamFetcher.authenticate('streamId', 'key', 'read').catch(function() {
				streamFetcher.authenticate('streamId', 'key', 'read').catch(function() {
					streamFetcher.authenticate('streamId', 'key', 'read').catch(function() {
						assert.equal(numOfRequests, 3)
						broken = false
						Promise.all([
							streamFetcher.authenticate('streamId', 'key', 'read'),
							streamFetcher.authenticate('streamId', 'key', 'read'),
							streamFetcher.authenticate('streamId', 'key', 'read'),
							streamFetcher.authenticate('streamId', 'key', 'read'),
							streamFetcher.authenticate('streamId', 'key', 'read')
						]).then(function() {
							assert.equal(numOfRequests, 3 + 1)
							done()
						})
					})
				})
			})
		})
	})

	describe('authenticatedFetch', function() {
		it('returns Promise', function() {
			assert(streamFetcher.authenticatedFetch('streamId', 'key') instanceof Promise)
		})

		it('rejects with 404 if stream does not exist', function(done) {
			streamFetcher.authenticatedFetch('nonExistingStreamId', 'key').catch(function(code) {
				assert.equal(code, 404)
				done()
			})
		})

		it('rejects with 403 if key does not grant access to stream', function(done) {
			streamFetcher.authenticatedFetch('streamId', 'nonExistantKey').catch(function(code) {
				assert.equal(code, 403)
				done()
			})
		})

		it('resolves with stream if key provides privilege to stream', function(done) {
			streamFetcher.authenticatedFetch('streamId', 'key').then(function(stream) {
				assert.deepEqual(stream, {
					id: 'streamId',
					partitions: 1,
					name: 'example stream',
					description: 'a stream used inside test',
					feed: {
						id: 'feedId',
						name: 'feedName',
						module: 7
					},
					config: {}
				})
				done()
			}).catch(function(err) {
				done(err)
			})
		})

		it('caches repeated invocations', function(done) {
			Promise.all([streamFetcher.authenticatedFetch('streamId', 'key'),
				streamFetcher.authenticatedFetch('streamId', 'key'),
				streamFetcher.authenticatedFetch('streamId', 'key'),
				streamFetcher.authenticatedFetch('streamId2', 'key'),
				streamFetcher.authenticatedFetch('streamId', 'key'),
				streamFetcher.authenticatedFetch('streamId2', 'key'),
				streamFetcher.authenticatedFetch('streamId2', 'key'),
				streamFetcher.authenticatedFetch('streamId2', 'key')
			]).catch(function() {
				assert.equal(numOfRequests, 2)
				done()
			})
		})

		it('does not cache errors', function (done) {
			broken = true
			streamFetcher.authenticatedFetch('streamId', 'key').catch(function() {
				streamFetcher.authenticatedFetch('streamId', 'key').catch(function() {
					streamFetcher.authenticatedFetch('streamId', 'key').catch(function() {
						assert.equal(numOfRequests, 3)
						broken = false
						Promise.all([
							streamFetcher.authenticatedFetch('streamId', 'key'),
							streamFetcher.authenticatedFetch('streamId', 'key'),
							streamFetcher.authenticatedFetch('streamId', 'key'),
							streamFetcher.authenticatedFetch('streamId', 'key'),
							streamFetcher.authenticatedFetch('streamId', 'key')
						]).then(function() {
							assert.equal(numOfRequests, 3 + 1)
							done()
						})
					})
				})
			})
		})
	})
})