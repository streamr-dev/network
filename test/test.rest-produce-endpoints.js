const assert = require('assert')
const sinon = require('sinon')
const EventEmitter = require('events')
const express = require('express')
const request = require('supertest')
const router = require('../lib/rest-produce-endpoints')

describe('RESTful produce endpoint', function () {
	let app
	let streamFetcher
	let partitioner
	let kafka
	let res

	// TODO: change args to object, add query params
	function postRequest(opts = {}) {
		opts = Object.assign({
			streamId: 'streamId',
			body: '{}',
			key: 'authKey',
			headers: {},
			query: {}
		}, opts)

		let headers = Object.assign({
			'Content-Type': 'application/json',
			'Authorization': `Token ${opts.key}`
		}, opts.headers)

		let req = request(app)
			.post(`/streams/${opts.streamId}/data`)
		req.query(opts.query)
			.send(opts.body)

		Object.keys(headers).forEach((key) => {
			req.set(key, headers[key])
		})

		return req
	}

	beforeEach(function() {
		app = express()

		streamFetcher = {
            authenticate: sinon.stub().resolves({streamId: "streamId", partitions: 10})
		}
		kafka = new EventEmitter()
		kafka.send = sinon.stub().yields()

		partitioner = {
			partition: sinon.stub().returns(0)
		}

		app.use(router(streamFetcher, kafka, partitioner))
	})

	describe('producing before kafka is ready', function() {
		it('returns 503', function(done) {
			postRequest()
				.expect(503, done)
		})
	})

	describe('producing after kafka is ready', function() {

		beforeEach('kafka is ready', function() {
			kafka.emit('ready')
		})

		it('should return 200 for valid requests', function(done) {
			postRequest()
				.expect(200, done)
		})

		it('should return 400 if the body is empty', function(done) {
			postRequest({
				streamId: 'streamId',
				body: ''
			}).expect(400, done)
		})

		it('should give undefined partition key to partitioner if none is defined', function(done) {
			postRequest()
				.expect(200)
				.end(() => {
					assert(partitioner.partition.calledWith(10, undefined))
					done()
				})
		})

		it('should call partitioner using a given partition key', function(done) {
			postRequest({
				query: {
					pkey: "foo"
				}
			})
				.expect(200)
				.end(() => {
					assert(partitioner.partition.calledWith(10, 'foo'))
					done()
				})
		})

		it('should produce to kafka', function(done) {
			postRequest()
				.expect(200)
				.end(() => {
					assert(kafka.send.calledOnce)
					done()
				})
		});

		it('should call kafka.send() with correct stream id and partition returned by the partitioner', function(done) {
			partitioner.partition = sinon.stub().withArgs(10, "pkey").returns(5)
			postRequest({
				query: {
					pkey: "pkey"
				}
			})
				.expect(200)
				.end(() => {
					var streamrBinaryMessage = kafka.send.getCall(0).args[0]
					assert.equal(streamrBinaryMessage.streamId, 'streamId')
					assert.equal(streamrBinaryMessage.streamPartition, 5)
					done()
				})
		});

		it('should use current timestamp by default', function(done) {
			var timestamp = Date.now()
			postRequest()
				.expect(200)
				.end(() => {
					var streamrBinaryMessage = kafka.send.getCall(0).args[0]
					assert(streamrBinaryMessage.timestamp >= timestamp, streamrBinaryMessage.timestamp+" >= "+timestamp)
					var now = Date.now()
					assert(streamrBinaryMessage.timestamp <= now, streamrBinaryMessage+" <= "+now)
					done()
				})
		})

		it('should use ttl if given', function(done) {
			var ttl = 30

			postRequest({
				query: {
					ttl: ttl.toString()
				}
			})
				.expect(200)
				.end(() => {
					var streamrBinaryMessage = kafka.send.getCall(0).args[0]
					assert.equal(streamrBinaryMessage.ttl, ttl)
					done()
				})
		})

		it('should return 400 for invalid ttl', function(done) {
			postRequest({
				query: {
					ttl: "foo"
				}
			}).expect(400, done)
		})

		it('returns 500 if there is an error producing to kafka', function(done) {
			kafka.send = sinon.stub().yields("error")
			postRequest()
				.expect(500, done)
		})
		
	})

})