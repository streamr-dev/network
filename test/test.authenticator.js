const assert = require('assert')
const express = require('express')
const sinon = require('sinon')
const Authenticator = require('../lib/authenticator')

describe('Authenticator', function () {

	var authenticator
	var expressApp
	var server

	beforeEach(function(done) {
		expressApp = express()
		expressApp.get('/api/v1/permissions/authenticate', function(req, res) {
			if (req.query.streamId === 'streamId' && req.query.authKey === 'key' && req.query.operation === 'read') {
				res.sendStatus(200)
			} else {
				res.sendStatus(403)
			}
		})
		server = expressApp.listen(6194, function() {
			console.info('Server started on port 6194\n')
			done()
		})
		authenticator = new Authenticator('http://127.0.0.1:6194')
	})

	afterEach(function() {
		server.close()
	})

	describe('authenticate', function() {

		it('throws error if given invalid operation argument', function(done) {
			try {
				authenticator.authenticate('streamId', 'key', 'asdasd')
			} catch (err) {
				assert.equal(err, 'Invalid operation: asdasd')
				done()
			}
		})

		it('returns Promise', function() {
			assert(authenticator.authenticate('streamId', 'key', 'read') instanceof Promise)
		})

		it('does not authenticate if stream does not exist', function(done) {
			authenticator.authenticate('nonExistingStreamId', 'key', 'read').catch(function(code) {
				assert.equal(code, 403)
				done()
			})
		})

		it('does not authenticate if key does not exist', function(done) {
			authenticator.authenticate('streamId', 'nonExistantKey', 'read').catch(function(code) {
				assert.equal(code, 403)
				done()
			})
		})

		it('does not authenticate if key does not grant privilege to stream', function(done) {
			authenticator.authenticate('streamId2', 'key', 'read').catch(function(code) {
				assert.equal(code, 403)
				done()
			})
		})

		it('does not authenticate if key provides lower privilege to stream than requested', function(done) {
			authenticator.authenticate('streamId2', 'key', 'write').catch(function(code) {
				assert.equal(code, 403)
				done()
			})
		})

		it('authenticates if key provides privilege to stream', function(done) {
			authenticator.authenticate('streamId', 'key', 'read').then(function() {
				done()
			})
		})
	})
})