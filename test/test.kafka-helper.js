var assert = require('assert')
var events = require('events')
var KafkaHelper = require('../lib/kafka-helper')

describe('kafka-helper', function () {

	var helper
	var clientMock
	var consumerMock
	var offsetMock
	var offsetResponses = []
	var decoderMock

	beforeEach(function() {
		clientMock = new events.EventEmitter()
		clientMock.close = function() {
			clientMock.closed = true
		}
		setTimeout(function() {
			clientMock.ready = true
			clientMock.emit('ready')
		})

		consumerMock = new events.EventEmitter()
		consumerMock.close = function() {}

		offsetMock = new events.EventEmitter()
		offsetMock.fetch = function(requests, callback) {
			assert(offsetResponses.length>0)
			var correct = offsetResponses[0]
			offsetResponses.shift()

			assert.equal(correct.requests.length, requests.length)
			for (var i=0; i<correct.requests.length; i++) {
				assert.equal(correct.requests[i].topic, requests[i].topic)
				assert.equal(correct.requests[i].time, requests[i].time)
			}
			callback(correct.error, correct.response)
		}

		decoderMock = {
			decode: function(message) {
				return {message: message}
			}
		}

		KafkaHelper.prototype.createClient = function() {
			return clientMock
		}
		KafkaHelper.prototype.createConsumer = function() {
			return consumerMock
		}
		KafkaHelper.prototype.createOffset = function() {
			return offsetMock
		}

		kh = new KafkaHelper('invalid-zookeeper-addr')
		kh.decoder = decoderMock
		kh.options.retryTime = 0
	});

	afterEach(function() {
		if (offsetResponses.length>0)
			throw "Some offset responses were left: "+JSON.stringify(offsetResponses)
	});

	it('should emit message event when the consumer receives messages', function (done) {
		kh.once('message', function(value, topic) {
			assert.equal(value.test, true)
			assert.equal(topic, "topic")
			done()
		})

		consumerMock.emit('message', {
			topic: 'topic',
			offset: 0,
			value: {
				test: true
			}
		})
	});

	describe("getOffset()", function() {
		it('should use the offset fetcher and call the callback with the offset', function (done) {
			offsetResponses.push({
				requests: [{topic:"topic", time:-2}],
				response: {topic:{0:[5]}}
			})

			kh.getOffset("topic", true, function(offset, earliest) {
				assert.equal(offset, 5)
				assert(earliest)
				done()
			})
		});

		it('should use time -1 for latest offset', function (done) {
			offsetResponses.push({
				requests: [{topic:"topic", time:-1}],
				response: {topic:{0:[10]}}
			})

			kh.getOffset("topic", false, function(offset, earliest) {
				assert.equal(offset, 10)
				assert(!earliest)
				done()
			})
		});

		it('should retry on LeaderNotAvailable error', function(done) {
			offsetResponses.push({
				requests: [{topic:"topic", time:-1}],
				error: "LeaderNotAvailable"
			})
			offsetResponses.push({
				requests: [{topic:"topic", time:-1}],
				response: {topic:{0:[10]}}
			})

			kh.getOffset("topic", false, function(offset, earliest) {
				assert.equal(offset, 10)
				assert(!earliest)
				done()
			})
		})

		it('should retry on UnknownTopicOrPartition error', function(done) {
			offsetResponses.push({
				requests: [{topic:"topic", time:-1}],
				error: "UnknownTopicOrPartition"
			})
			offsetResponses.push({
				requests: [{topic:"topic", time:-1}],
				response: {topic:{0:[10]}}
			})

			kh.getOffset("topic", false, function(offset, earliest) {
				assert.equal(offset, 10)
				assert(!earliest)
				done()
			})
		})

		it('should retry if the length of offsets is zero', function(done) {
			offsetResponses.push({
				requests: [{topic:"topic", time:-1}],
				response: {topic:{0:[]}}
			})
			offsetResponses.push({
				requests: [{topic:"topic", time:-1}],
				response: {topic:{0:[10]}}
			})

			kh.getOffset("topic", false, function(offset, earliest) {
				assert.equal(offset, 10)
				assert(!earliest)
				done()
			})
		})

		it('should not crash if the offsets is undefined (kafka was not available)', function(done) {
			offsetMock.fetch = function(requests, callback) {
				callback("Test error", undefined)
			}

			kh.getOffset("topic", false, function(offset, earliest, error) {
				assert.equal(error, "Test error")
				assert(!offset)
				assert(!earliest)
				done()
			})
		})
	})

	describe("subscribe()", function() {

		it('should emit subscribed', function(done) {
			consumerMock.addTopics = function(requests, cb) {
				cb(undefined, ["topic"])
			}
			kh.once('subscribed', function(topic) {
				assert.equal(topic,"topic")
				done()
			})
			kh.subscribe("topic", 0)
		})

		it('should query for a start offset if none is specified', function(done) {			
			offsetResponses.push({
				requests: [{topic:"topic", time:-1}],
				response: {topic:{0:[5]}}
			})

			var addTopicsCalled = false
			consumerMock.addTopics = function(requests, cb) {
				addTopicsCalled = true
				assert.equal(requests.length, 1)
				assert.equal(requests[0].topic, "topic")
				assert.equal(requests[0].offset, 5)
				cb(undefined, ["topic"])
			}

			kh.subscribe("topic", undefined, function(topic, offset) {
				assert.equal(topic, "topic")
				assert.equal(offset, 5)
				assert(addTopicsCalled)
				done()
			})

		})

		it('should subscribe from given offset if specified', function(done) {			

			var addTopicsCalled = false
			consumerMock.addTopics = function(requests, cb) {
				addTopicsCalled = true
				assert.equal(requests.length, 1)
				assert.equal(requests[0].topic, "topic")
				assert.equal(requests[0].offset, 5)
				cb(undefined, ["topic"])
			}

			kh.subscribe("topic", 5, function(topic, offset) {
				assert.equal(topic, "topic")
				assert.equal(offset, 5)
				assert(addTopicsCalled)
				done()
			})

		})

	})

	describe("unsubscribe()", function() {
		it('should emit unsubscribed', function(done) {
			consumerMock.removeTopics = function(topics, cb) {
				cb(undefined, topics)
			}
			kh.once('unsubscribed', function(topic) {
				assert.equal(topic,"topic")
				done()
			})
			kh.unsubscribe("topic")
		})

		it('should remove the topic from the consumer', function(done) {			

			var removeTopicsCalled = false
			consumerMock.removeTopics = function(topics, cb) {
				removeTopicsCalled = true
				assert.equal(topics.length, 1)
				assert.equal(topics[0], "topic")
				cb(undefined, topics)
			}

			kh.unsubscribe("topic", function(topic) {
				assert.equal(topic, "topic")
				assert(removeTopicsCalled)
				done()
			})

		})
	})

	describe("decodeMessage()", function() {
		it('should call the decoder and should add _S and _C fields to decoded messages', function(done) {			

			var decoderCalled = false
			kh.decoder = {
				decode: function(message) {
					decoderCalled = true
					return decoderMock.decode(message)
				}
			}

			var message = kh.decodeMessage({
				topic: "topic",
				offset: 10,
				value: {foo:"bar"}
			})

			assert.equal(message.foo, "bar")
			assert.equal(message._S, "topic")
			assert.equal(message._C, 10)
			done()
		})
		it('should append a _T timestamp field for Kafka messages if requested', function(done) {
			var date = Date.now()
			kh.decoder = {
				decode: function(message) {
					var result = decoderMock.decode(message)
					result.timestamp = date
					return result
				}
			}

			var message = kh.decodeMessage({
				topic: "topic",
				offset: 10,
				value: {foo:"bar"}
			}, true)

			assert.equal(message._T, date)
			done()
		})
	})

	describe("resend()", function() {
		it('should resend nothing if toOffset < fromOffset', function(done) {			
			kh.resend("topic", 5, 4, function() {throw "Should not resend!"}, done)
		})

		it('should call the handler for the requested messages and then close the client and consumer', function(done) {
			var expected = 1
			var ids = ["first", "second", "third"]
			var consumerClosed = false
			var clientClosed = false
			var handlerCalledCount = 0

			var handler = function(msg) {
				assert.equal(expected++, msg._C)
				assert(msg._C>=1 && msg._C<=3)
				assert.equal(msg.id, ids[msg._C-1])
				handlerCalledCount++
			}

			kh.createConsumer = function(client, req) {
				assert.equal(req.length, 1)
				assert.equal(req[0].topic, "topic")
				assert.equal(req[0].offset, 1)
				consumerMock.close = function() {
					consumerClosed = true
				}
				return consumerMock
			}

			kh.createClient = function() {
				clientMock.close = function() {
					clientClosed = true
				}
				return clientMock
			}

			kh.resend("topic", 1, 3, handler, function() {
				assert(clientClosed)
				assert(consumerClosed)
				assert.equal(handlerCalledCount, 3)
				done()
			})
			consumerMock.emit('message', {
				topic: "topic",
				offset: 1,
				value: {
					id: "first"
				}
			})
			consumerMock.emit('message', {
				topic: "topic",
				offset: 2,
				value: {
					id: "second"
				}
			})
			consumerMock.emit('message', {
				topic: "topic",
				offset: 3,
				value: {
					id: "third"
				}
			})
		})

		it('should NOT call the handler for messages outside the requested span', function(done) {
			var handler = function(msg) {
				assert(msg._C>=1 && msg._C<=3)
			}

			kh.resend("topic", 1, 2, handler, done)

			consumerMock.emit('message', {
				topic: "topic",
				offset: 0,
				value: {}
			})
			consumerMock.emit('message', {
				topic: "topic",
				offset: 1,
				value: {}
			})
			consumerMock.emit('message', {
				topic: "topic",
				offset: 2,
				value: {}
			})
			consumerMock.emit('message', {
				topic: "topic",
				offset: 3,
				value: {}
			})
		})
	})

	describe('getFirstOffsetAfter', function() {
		var dates

		beforeEach(function() {
			dates = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

			// mock getOffset
			kh.getOffset = function(topic, first, cb) {
				setTimeout(function() {
					if (first)
						cb(0)
					else cb(dates.length)
				})
			}

			// mock getTimestampForOffset
			kh.getTimestampForOffset = function(client, topic, partition, offset, cb) {
				setTimeout(function() {
					if (dates[offset]===undefined)
						throw "requested timestamp for an out-of-range offset: "+offset
					else cb(dates[offset])
				})
			}
		})

		it('should return the first available offset if requested date is before the first available message', function(done) {
			kh.getFirstOffsetAfter("topic", 0, dates[0]-100, function(offset) {
				assert.equal(offset, 0)
				done()
			})
		})

		it('should return the next available offset if requested date is after the latest message', function(done) {
			kh.getFirstOffsetAfter("topic", 0, dates[dates.length-1] + 100, function(offset) {
				assert.equal(offset, dates.length)
				done()
			})
		})

		it('should start a binary search if the requested date is between the first and last available message', function(done) {
			kh.getFirstOffsetAfter("topic", 0, dates[3] + 1, function(offset) {
				assert.equal(offset, 4)
				done()
			})
		})

		it('should return the offset of an exact timestamp match', function(done) {
			kh.getFirstOffsetAfter("topic", 0, dates[3], function(offset) {
				assert.equal(offset, 3)
				done()
			})
		})

		it('should find the first item', function(done) {
			kh.getFirstOffsetAfter("topic", 0, dates[0], function(offset) {
				assert.equal(offset, 0)
				done()
			})
		})

		it('should find the last item', function(done) {
			kh.getFirstOffsetAfter("topic", 0, dates[dates.length-1], function(offset) {
				assert.equal(offset, dates.length-1)
				done()
			})
		})

		it('should close the temporary client before calling the callback', function(done) {
			kh.getFirstOffsetAfter("topic", 0, dates[0]-100, function(offset) {
				assert(clientMock.closed)
				done()
			})
		})

	})

	describe('binarySearchOffsetForDate', function() {
		it('should find the first offset after the requested date', function(done) {
			var dates = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

			// mock getTimestampForOffset
			kh.getTimestampForOffset = function(client, topic, partition, offset, cb) {
				setTimeout(function() {
					cb(dates[offset])
				})
			}

			kh.binarySearchOffsetForDate(clientMock, "topic", 0, 35, 0, dates.length-1, function(offset) {
				assert.equal(offset, dates.indexOf(40))
				done()
			})
		})

		it('should propagate the error if one occurs', function(done) {
			// mock getTimestampForOffset to always return an error
			kh.getTimestampForOffset = function(client, topic, partition, offset, cb) {
				setTimeout(function() {
					cb(undefined, "error")
				})
			}

			kh.binarySearchOffsetForDate(clientMock, "topic", 0, 35, 0, 5, function(offset, err) {
				assert.equal(offset, undefined)
				assert.equal(err, "error")
				done()
			})
		})
	})

	describe('getTimestampForOffset', function() {

		it('should send a fetch request for the offset', function(done) {
			var date = Date.now()
			kh.decoder = {
				decode: function(message) {
					var result = decoderMock.decode(message)
					result.timestamp = date
					return result
				}
			}

			clientMock.sendFetchRequest = function(consumer, reqs, fetchMaxWaitMs, fetchMinBytes, maxTickMessages) {
				consumer.emit('message', {
					topic: reqs[0].topic,
					partition: reqs[0].partition, 
					offset: reqs[0].offset,
					value: {
						foo: 'bar'
					}
				})
			}

			kh.getTimestampForOffset(clientMock, "topic", 0, 5, function(ts, err) {
				assert.equal(err, undefined)
				assert.equal(ts, date)
				done()
			})
		})

		it('should call the callback with an error if the offset is out of range', function(done) {

			clientMock.sendFetchRequest = function(consumer, reqs, fetchMaxWaitMs, fetchMinBytes, maxTickMessages) {
				consumer.emit('offsetOutOfRange', {
					topic: reqs[0].topic,
					partition: reqs[0].partition,
					message: "TEST ERROR MESSAGE"
				})
			}

			kh.getTimestampForOffset(clientMock, "topic", 0, 5, function(ts, err) {
				assert.equal(ts, undefined)
				assert(err !== undefined)
				done()
			})
		})

		it('should call the callback with an error if any other error occurs', function(done) {

			clientMock.sendFetchRequest = function(consumer, reqs, fetchMaxWaitMs, fetchMinBytes, maxTickMessages) {
				consumer.emit('error', {
					topic: reqs[0].topic,
					partition: reqs[0].partition,
					message: "TEST ERROR MESSAGE"
				})
			}

			kh.getTimestampForOffset(clientMock, "topic", 0, 5, function(ts, err) {
				assert.equal(ts, undefined)
				assert(err !== undefined)
				done()
			})
		})
	})
});
