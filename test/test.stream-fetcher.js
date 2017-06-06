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
	var streamJson

	var permissions

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
				res.status(200).send(permissions)
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
				res.status(200).send(streamJson)
			}
		})

		server = expressApp.listen(6194, function() {
			console.info('Server started on port 6194\n')
			done()
		})

		streamFetcher = new StreamFetcher('http://127.0.0.1:6194')

		streamJson = {
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
		}

		permissions = [
			{
				"id": null,
				"user": "tester1@streamr.com",
				"operation": "read"
			}
		]
	})

	afterEach(function() {
		server.close()
	})

	describe('checkPermission', function() {
		it('returns Promise', function() {
			assert(streamFetcher.checkPermission('streamId', 'key', 'read') instanceof Promise)
		})

		it('rejects with 404 if stream does not exist', function(done) {
			streamFetcher.checkPermission('nonExistingStreamId', 'key', 'read').catch(function(code) {
				assert.equal(code, 404)
				done()
			})
		})

		it('rejects with 403 if key does not grant access to stream', function(done) {
			streamFetcher.checkPermission('streamId', 'nonExistantKey', 'read').catch(function(code) {
				assert.equal(code, 403)
				done()
			})
		})

		it('rejects with 403 if key does not provides (desired level) privilege to stream', function(done) {
			streamFetcher.checkPermission('streamId', 'key', 'write').catch(function(code) {
				assert.equal(code, 403)
				done()
			})
		})

		it('resolves with true if key provides privilege to stream', function(done) {
			streamFetcher.checkPermission('streamId', 'key', 'read').then(function(response) {
				assert.deepEqual(response, true)
				done()
			}).catch(function(err) {
				done(err)
			})
		})

		it('caches repeated invocations', function(done) {
			Promise.all([streamFetcher.checkPermission('streamId', 'key', 'read'),
				streamFetcher.checkPermission('streamId', 'key', 'read'),
				streamFetcher.checkPermission('streamId', 'key', 'read'),
				streamFetcher.checkPermission('streamId2', 'key', 'read'),
				streamFetcher.checkPermission('streamId', 'key', 'read'),
				streamFetcher.checkPermission('streamId2', 'key', 'read'),
				streamFetcher.checkPermission('streamId2', 'key', 'read'),
				streamFetcher.checkPermission('streamId2', 'key', 'read')
			]).catch(function() {
				assert.equal(numOfRequests, 2)
				done()
			})
		})

		it('does not cache errors', function (done) {
			broken = true
			streamFetcher.checkPermission('streamId', 'key', 'read').catch(function() {
				streamFetcher.checkPermission('streamId', 'key', 'read').catch(function() {
					streamFetcher.checkPermission('streamId', 'key', 'read').catch(function() {
						assert.equal(numOfRequests, 3)
						broken = false
						Promise.all([
							streamFetcher.checkPermission('streamId', 'key', 'read'),
							streamFetcher.checkPermission('streamId', 'key', 'read'),
							streamFetcher.checkPermission('streamId', 'key', 'read'),
							streamFetcher.checkPermission('streamId', 'key', 'read'),
							streamFetcher.checkPermission('streamId', 'key', 'read')
						]).then(function() {
							assert.equal(numOfRequests, 3 + 1)
							done()
						})
					})
				})
			})
		})
	})

	describe('fetch', function() {
		it('returns Promise', function() {
			assert(streamFetcher.fetch('streamId', 'key') instanceof Promise)
		})

		it('rejects with 404 if stream does not exist', function(done) {
			streamFetcher.fetch('nonExistingStreamId', 'key').catch(function(code) {
				assert.equal(code, 404)
				done()
			})
		})

		it('rejects with 403 if key does not grant access to stream', function(done) {
			streamFetcher.fetch('streamId', 'nonExistantKey').catch(function(code) {
				assert.equal(code, 403)
				done()
			})
		})

		it('resolves with stream if key provides privilege to stream', function(done) {
			streamFetcher.fetch('streamId', 'key').then(function(stream) {
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
			Promise.all([streamFetcher.fetch('streamId', 'key'),
				streamFetcher.fetch('streamId', 'key'),
				streamFetcher.fetch('streamId', 'key'),
				streamFetcher.fetch('streamId2', 'key'),
				streamFetcher.fetch('streamId', 'key'),
				streamFetcher.fetch('streamId2', 'key'),
				streamFetcher.fetch('streamId2', 'key'),
				streamFetcher.fetch('streamId2', 'key')
			]).catch(function() {
				assert.equal(numOfRequests, 2)
				done()
			})
		})

		it('does not cache errors', function (done) {
			broken = true
			streamFetcher.fetch('streamId', 'key').catch(function() {
				streamFetcher.fetch('streamId', 'key').catch(function() {
					streamFetcher.fetch('streamId', 'key').catch(function() {
						assert.equal(numOfRequests, 3)
						broken = false
						Promise.all([
							streamFetcher.fetch('streamId', 'key'),
							streamFetcher.fetch('streamId', 'key'),
							streamFetcher.fetch('streamId', 'key'),
							streamFetcher.fetch('streamId', 'key'),
							streamFetcher.fetch('streamId', 'key')
						]).then(function() {
							assert.equal(numOfRequests, 3 + 1)
							done()
						})
					})
				})
			})
		})
	})

	describe('authenticate', function() {
		it('only fetches if read permission is required', function(done) {
			streamFetcher.checkPermission = sinon.stub()
			streamFetcher.authenticate('streamId', 'key').then(function(json) {
				assert.equal(numOfRequests, 1)
				assert.deepEqual(json, streamJson)
				assert(streamFetcher.checkPermission.notCalled)
				done()
			})
		})

		it('checks permission and fetches if write permission is required', function(done) {
			permissions.push({
					"id": null,
					"user": "tester1@streamr.com",
					"operation": "write"
			})

			streamFetcher.authenticate('streamId', 'key', 'write').then(function(json) {
				assert.equal(numOfRequests, 2)
				assert.deepEqual(json, streamJson)
				done()
			})
		})
	})
})