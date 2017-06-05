const assert = require('assert')
const express = require('express')
const request = require('supertest')
const sinon = require('sinon')
const authenticationMiddleware = require('../lib/authentication-middleware')

describe('AuthenticationMiddleware', function() {

	let request
	let response
	let next
	let streamFetcherStub
	let middlewareInstance

	beforeEach(function() {
		request = {
			headers: {}
		}
		response = {
			status: sinon.stub(),
			send: sinon.spy()
		}
		response.status.returns(response)
		next = sinon.spy()
		streamFetcherStub = {}
		middlewareInstance = authenticationMiddleware(streamFetcherStub)
	})

	it('responds 400 and error message if authorization header not given', function() {
		middlewareInstance(request, response, next)

		sinon.assert.notCalled(next)
		sinon.assert.calledOnce(response.status)
		sinon.assert.calledOnce(response.send)
		sinon.assert.calledWithExactly(response.status, 400)
		sinon.assert.calledWithExactly(response.send, {
			error: 'Header "Authorization" required.'
		})
	})

	it('responds 400 and error message if authorization header malformed', function() {
		request.headers.authorization = "doken 90rjsdojg9823jtopsdjglsd"

		middlewareInstance(request, response, next)

		sinon.assert.notCalled(next)
		sinon.assert.calledOnce(response.status)
		sinon.assert.calledOnce(response.send)
		sinon.assert.calledWithExactly(response.status, 400)
		sinon.assert.calledWithExactly(response.send, {
			error: 'Authorization header malformed. Should be of form "token authKey".'
		})
	})

	context('given well-formed authorization token', function() {
		beforeEach(function () {
			request.headers.authorization = 'tOkEn authKey'
			request.id = 'streamId' // Provided by previous middleware in real code
		})

		it('delegates streamId and authKey to streamFetcher#authenticate', function() {
			streamFetcherStub.authenticate = sinon.stub()
			streamFetcherStub.authenticate.returns(Promise.resolve({}))

			middlewareInstance(request, response, next)

			sinon.assert.calledOnce(streamFetcherStub.authenticate)
			sinon.assert.calledWithExactly(streamFetcherStub.authenticate,
				'streamId', 'authKey', 'READ')
		})

		it('responds 403 and error message if streamFetcher#authenticate results in error', function(done) {
			streamFetcherStub.authenticate = function() {
				return Promise.reject('error')
			}

			middlewareInstance(request, response, next)

			setTimeout(function() {
				sinon.assert.notCalled(next)
				sinon.assert.calledOnce(response.status)
				sinon.assert.calledOnce(response.send)
				sinon.assert.calledWithExactly(response.status, 403)
				sinon.assert.calledWithExactly(response.send, {
					error: 'Authentication failed.'
				})
				done()
			})
		})

		context('given streamFetcher#authenticate authenticates successfully', function() {
			beforeEach(function() {
				streamFetcherStub.authenticate = function(streamId, authKey, operation) {
					return Promise.resolve({
						id: streamId,
						partitions: 5,
						name: 'my stream',
						feed: {},
						config: {},
						description: 'description',
						uiChannel: null
					})
				}
			})

			it('invokes callback "next"', function(done) {
				middlewareInstance(request, response, next)
				setTimeout(function() {
					sinon.assert.calledOnce(next)
					done()
				})
			})

			it('puts stream JSON in request object', function(done) {
				middlewareInstance(request, response, next)
				setTimeout(function() {
					assert.deepEqual(request.stream, {
						id: 'streamId',
						partitions: 5,
						name: 'my stream',
						feed: {},
						config: {},
						description: 'description',
						uiChannel: null
					})
					done()
				})
			})
		})
	})
})