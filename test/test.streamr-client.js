"use strict"

var EventEmitter = require('eventemitter3')
var assert = require('assert'),
	mockery = require('mockery'),
	sinon = require('sinon'),
	mockDebug = require('debug')('mock')

var STREAM_KEY = "_S"
var COUNTER_KEY = "_C"
var TIMESTAMP_KEY = "_TS"
var BYE_KEY = "_bye"
var SUB_KEY = "_sub"

describe('StreamrClient', function() {
	var client
	var socket
	var asyncs = []

	var StreamrClient

	var ioMock
	var ioMockCalls

	function async(func) {
		var me = setTimeout(function() {
			assert.equal(me, asyncs[0])
			asyncs.shift()
			func()
		}, 0)
		asyncs.push(me)
	}

	function clearAsync() {
		asyncs.forEach(function(it) {
			clearTimeout(it)
		})
		asyncs = []
	}

    var previousOffsetByStreamId = {}

	// ['version', 'streamId', 'streamPartition', 'timestamp', 'ttl', 'offset', 'previousOffset', 'contentType', 'content']

	function msg(streamId, offset, content, subId, forcePreviousOffset) {
        content = content || {}

        // unicast message to subscription
        if (subId != null) {
            var msg = [
                28, // version
                streamId,
				0, // partition
                Date.now(), // timestamp
				0, // ttl
                offset,
                forcePreviousOffset, // previousOffset
                27, // contentType (JSON)
                content]

            return {
                m: msg,
                sub: subId
            }
        }
        // broadcast message to all subscriptions
        else {
            var previousOffset = forcePreviousOffset || previousOffsetByStreamId[streamId]
            previousOffsetByStreamId[streamId] = offset

            return [
                28, // version
                streamId,
				0, // partition
                Date.now(), // timestamp
				0, // ttl
                offset,
                previousOffset !== offset ? previousOffset : null,
                27, // contentType (JSON)
                content]
        }
	}

	function byeMsg(stream, counter) {
		var bye = {}
		bye[BYE_KEY] = true
		return msg(stream, counter, bye)
	}

	function createSocketMock() {
		var s = new EventEmitter()

		s.disconnect = function() {
			async(function() {
				mockDebug("socket.disconnect: emitting disconnect")
				s.emit('disconnect')
			})
		}

		s.defaultSubscribeHandler = function(request) {
			async(function() {
				mockDebug("defaultSubscribeHandler: emitting subscribed")
				s.emit('subscribed', {channel: request.channel})
			})
		}
		s.on('subscribe', s.defaultSubscribeHandler)

		s.defaultUnsubscribeHandler = function(request) {
			async(function() {
				mockDebug("defaultUnsubscribeHandler: emitting unsubscribed")
				s.emit('unsubscribed', {channel: request.channel})	
			})
		}
		s.on('unsubscribe', s.defaultUnsubscribeHandler)

		return s
	}

	before(function() {
		mockery.enable()

		mockery.registerMock('socket.io-client', function(uri, opts) {
			ioMockCalls++

			// Create new sockets for subsequent calls
			if (ioMockCalls > 1) {
				socket = createSocketMock()
			}

			async(function() {
				socket.emit('connect')
			})

			socket.uri = uri;
			socket.opts = opts;

			return socket
		});

		StreamrClient = require('../streamr-client')
	})

	beforeEach(function() {
		clearAsync()
		socket = createSocketMock()
		ioMockCalls = 0
		client = new StreamrClient()
		client.options.autoConnect = false
		client.options.autoDisconnect = false
        previousOffsetByStreamId = {}
	})

	after(function() {
		mockery.disable()
	})

	describe("connect", function() {
		it('should not pass transport details in io() call', function(done) {
			client.connect()
			client.socket.on("connect", function() {
				assert.strictEqual(client.socket.opts["transports"], null)
				done()
			})
		})

		context('when client initialized with transport details', function () {
			beforeEach(function () {
				client = new StreamrClient({
					transports: ["websocket"]
				})
			})

			it('should pass transport details in io() call', function(done) {
				client.connect()
				client.socket.on("connect", function() {
					assert.deepEqual(client.socket.opts["transports"], ["websocket"])
					done()
				})
			})
		})

		it('should emit pending subscribes', function(done) {
			var subscription = client.subscribe("stream1", function(message) {})
			client.connect()

			client.socket.on('subscribe', function(request) {
				if (request.channel==='stream1')
					done()
			})
		})

		it('should not emit anything on connect if not subscribed to anything', function(done) {
			client.connect()

			client.socket.emit = function() {
				if (this.event !== 'connect')
					throw "Unexpected emit: "+this.event
			}

			done()
		})

		it('should report that it is connected and not connecting after connecting', function(done) {
			client.connect()
			client.socket.on('connect', function() {
				assert(client.isConnected())
				assert(!client.connecting)
				done()
			})
		})

		it('should not be connecting initially', function() {
			assert(!client.connecting)
		})

		it('should report that it is connecting after calling connect()', function() {
			client.connect()
			assert(client.connecting)
		})

		it('should not try to connect while connecting', function(done) {
			client.options.autoConnect = true
			client.subscribe("stream1", function(message) {})
			client.subscribe("stream2", function(message) {})

			assert.equal(ioMockCalls, 1)
			done()
		})
	})

	describe("reconnect", function() {
		it('should emit a subscribe event on reconnect', function(done) {
			var subscription = client.subscribe("stream1", function(message) {})
			client.connect()

			// connect-disconnect-connect
			client.socket.once('connect', function() {
				client.socket.once('disconnect', function() {
					client.socket.on('subscribe', function(request) {
						console.log(request)
						if (request.channel==='stream1')
							done()
					})

					console.log("Disconnected, now connecting!")
					client.socket.emit('connect')
				})

				console.log("Connected, now disconnecting!")
				client.socket.emit('disconnect')

			})

		})

		it('should not emit a subscribe event for unsubscribed streams on reconnect', function(done) {
			var sub1 = client.subscribe("stream1", function(message) {})
			var sub2 = client.subscribe("stream2", function(message) {})
			client.connect()

			// when subscribed, a bye message is received, leading to an unsubscribe
			client.socket.on('subscribed', function(response) {
				if (sub1.isSubscribed() && sub2.isSubscribed()) {
					client.unsubscribe(sub1)
					client.socket.once('unsubscribed', function(response) {
						client.socket.emit('disconnect')

						client.socket.on('subscribe', function(request) {
							if (request.channel==="stream1")
								throw "Should not have subscribed to stream1 on reconnect!"
							if (request.channel==='stream2')
								done()
						})
						client.socket.emit('connect')
					})
				}
			})

		})

		it('should emit a subscribe event on reconnect for topics subscribed after initial connect', function(done) {
			client.connect()
			client.socket.once('connect', function() {
				client.subscribe("stream1", function(message) {})
				client.socket.once('subscribed', function() {
					client.socket.emit('disconnect')
					client.socket.once('subscribe', function(request) {
						if (request.channel==='stream1')
							done()
					})
					client.socket.emit('connect')
				})
			})
		})
	})

	describe("subscribe", function() {
		it('should throw an error if no streamId is given', function() {
			assert.throws(function() {
				client.subscribe(undefined, function() {})
			})
		})

		it('should throw an error if streamId is wrong type', function() {
			assert.throws(function() {
				client.subscribe(['streamId'], function() {})
			})
		})

		it('should throw an error if no callback is given', function() {
			assert.throws(function() {
				client.subscribe('stream1')
			})
		})

		it('should emit a subscribe event when subscribing after connecting', function(done) {
			client.connect()
			client.socket.once('connect', function() {
				client.socket.once('subscribe', function(request) {
					if (request.channel==='stream1')
						done()
				})
				client.subscribe("stream1", function(message) {})
			})
		})

		it('should add any subscription options to subscription request', function(done) {
			client.connect()
			client.socket.once('connect', function() {
				client.socket.once('subscribe', function(request) {
					if (request.foo === 'bar')
						done()
				})
				client.subscribe("stream1", function(message) {}, {foo: 'bar'})
			})
		})

		it('should ignore any subscription options that conflict with required ones', function(done) {
			client.connect()
			client.socket.once('connect', function() {
				client.socket.once('subscribe', function(request) {
					if (request.channel === 'stream1')
						done()
				})
				client.subscribe("stream1", function(message) {}, {channel: 'wrong'})
			})
		})

		it('should mark Subscriptions as subscribed when the server responds with subscribed', function(done) {
			var subscription = client.subscribe("stream1", function(message) {})
			client.connect()

			client.socket.once('subscribed', function() {
				assert(subscription.isSubscribed())
				done()
			})
		})

		it('should trigger an error event on the client if the subscribe fails', function(done) {
			socket.removeListener('subscribe', socket.defaultSubscribeHandler)

			socket.on('subscribe', function(request) {
				async(function() {
					socket.emit('subscribed', {channel: request.channel, error: 'error message'})	
				})
			})

			client.subscribe("stream1", function(message) {})
			client.connect()

			client.on('error', function(msg) {
				assert(msg.indexOf('error message' >= 0))
				done()
			})

		})

		it('should connect if autoConnect is set to true', function(done) {
			client.options.autoConnect = true
			client.connect = done
			client.subscribe("stream1", function(message) {})
		})

		it('should send only one subscribe request to server even if there are multiple subscriptions for same stream', function(done) {
			var subscribeCount = 0
			socket.on('subscribe', function(request) {
				subscribeCount++
				if (subscribeCount > 1)
					throw "Only one subscribe request should be sent to the server!"
			})

			var sub1 = client.subscribe("stream1", function(message) {})
			var sub2 = client.subscribe("stream1", function(message) {})
			client.connect()

			function check(sub) {
				sub._ack = true
				if (sub1._ack && sub2._ack)
					done()
			} 

			sub1.on('subscribed', function(response) {
				check(sub1)
			})
			sub2.on('subscribed', function(response) {
				check(sub2)
			})
		})

	})

	describe("subscribe with resend options", function() {

		it('should emit a resend request after subscribed', function(done) {
			var sub = client.subscribe("stream1", function(message) {}, {resend_all:true})
			client.connect()

			client.socket.once('resend', function(request) {
				if (request.resend_all) {
					if (sub.isSubscribed()) {
						done()
					} else throw "Resend request sent, but sub was not subscribed!"
				}
				else throw "Unexpected resend request: "+JSON.stringify(request)
			})

		})

		it('should emit a resend request with given other options', function(done) {
			client.subscribe("stream1", function(message) {}, {resend_all:true, foo: 'bar'})
			client.connect()

			client.socket.once('resend', function(request) {
				if (request.resend_all && request.foo === 'bar')
					done()
				else throw "Unexpected resend request: "+JSON.stringify(request)
			})
		})

		it('should throw an error if multiple resend options are given', function() {
			assert.throws(function() {
				client.subscribe("stream1", function(message) {}, {resend_all:true, resend_last:5})
			})
		})

		it('should resend to multiple subscriptions as per each resend option', function(done) {
			var sub1count = 0
			var sub1 = client.subscribe("stream1", function(message) {
				sub1count++
				if (sub1count > 2)
					throw "sub1 received more than 2 messages!"
			}, {resend_all:true})

			var sub2count = 0
			var sub2 = client.subscribe("stream1", function(message) {
				sub2count++
				if (sub2count > 1)
					throw "sub2 received more than 1 message"
			}, {resend_last:1})

			client.connect()

			client.socket.on('resend', function(request) {
				if (request.resend_all) {
					async(function() {
						client.socket.emit('resending', {channel:'stream1', sub: request.sub})
						client.socket.emit('u', msg('stream1', 0, request.sub))
						client.socket.emit('u', msg('stream1', 1, request.sub))
						client.socket.emit('resent', {channel:'stream1', sub: request.sub})
					})
				}
				else if (request.resend_last===1) {
					async(function() {
						client.socket.emit('resending', {channel:'stream1', sub: request.sub})
						client.socket.emit('ui', msg('stream1', 1, request.sub))
						client.socket.emit('resent', {channel:'stream1', sub: request.sub})
					})
				}
			})

			var subCount = 0
			client.socket.on('subscribe', function(request) {
				subCount++

				if (subCount>1)
					throw "Only one subscribe should have been sent"

				done()
			})
		})

		it('should not crash on resent if bye message is received while resending', function(done) {
			var sub = client.subscribe("stream1", function(message) {}, {resend_all:true})
			client.connect()

			client.socket.once('resend', function(request) {
				async(function() {
					client.socket.emit('resending', {channel:'stream1', sub:sub.id})
					client.socket.emit('b', byeMsg('stream1', 0))
					client.socket.emit('resent', {channel:'stream1', sub:sub.id})
					done()
				})
			})

		})

		it('should not crash if messages exist after the bye message', function(done) {
			var sub = client.subscribe("stream1", function(message) {}, {resend_all:true})
			client.connect()

			client.socket.once('resend', function(request) {
				async(function() {
					client.socket.emit('resending', {channel:'stream1', sub:sub.id})
					client.socket.emit('b', byeMsg('stream1', 0))
					client.socket.emit('u', msg('stream1', 1, sub.id))
					client.socket.emit('resent', {channel:'stream1', sub:sub.id})
					done()
				})
			})

		})
	})

	describe("message handling", function() {

		it('should call the callback when a message is received', function(done) {
			var sub = client.subscribe("stream1", function(message) {
				done()
			})
			client.connect()
			client.socket.once('subscribed', function() {
				client.socket.emit('b', msg("stream1", 0))
			})
		})

		it('should not call the callback nor throw an exception when a message is re-received', function(done) {
			var callbackCounter = 0
			client.subscribe("stream1", function(message) {
				callbackCounter++
				if (callbackCounter>1)
					throw "Callback called more than once!"
			})
			client.connect()

			client.socket.once('subscribed', function() {
				// Fake messages
				client.socket.emit('b', msg("stream1",0))
				client.socket.emit('b', msg("stream1",0))
				client.socket.emit('b', msg("stream1",0))
				done()
			})			
		})
		
		it('should call the callback once for each message in order', function(done) {
			var count = 0
			client.subscribe("stream1", function(message) {
				console.log("Count: "+count+", message: "+message.count)
				
				if (message.count !== count)
					throw "Message counter: "+message.count+", expected: "+count
					
				if (++count === 3)
					done()
			})
			client.connect()
			
			client.socket.once('subscribed', function() {
				client.socket.emit('b', msg("stream1", 0, {count:0}))
				client.socket.emit('b', msg("stream1", 1, {count:1}))
				client.socket.emit('b', msg("stream1", 2, {count:2}))
			})
		})

		it('should emit unsubscribe after processing a message with the bye key', function(done) {
			var processed = false
			client.subscribe("stream1", function(message) {
				processed = true
			})
			client.connect()

			client.socket.once('subscribed', function() {
				client.socket.emit('b', byeMsg("stream1", 0))
			})

			client.socket.once('unsubscribed', function(response)  {
				if (processed && response.channel==='stream1')
					done()
			})
		})

		it('should direct messages to specific subscriptions if the messages contain the _sub key', function(done) {
			var sub1 = client.subscribe("stream1", function(message) {
				throw "sub1 should not have received a message!"
			})
			sub1.counter = 0

			var sub2 = client.subscribe("stream1", function(message) {
				done()
			})
			sub2.counter = 0

			client.connect()
			sub2.on('subscribed', function() {
				assert.throws(function() {
                    // Received by sub2
					client.socket.emit('b', msg('stream1', 0, {}))
				})
				client.socket.emit('u', msg('stream1', 0, {}, sub2.id))
			})
		})

		it('should not call the handlers with any additional keys present in the message', function(done) {
			var sub = client.subscribe("stream1", function(message) {
				console.log(message)
				assert.equal(Object.keys(message).length, 1)
				done()
			})
			client.connect()

			client.socket.once('subscribed', function() {
				client.socket.emit('b', msg("stream1", 0, {count:0}))
			})
		})

	})

	describe('unsubscribe', function() {
		it('should fire the unsubscribed event', function(done) {
			var sub = client.subscribe("stream1", function(message) {})
			client.connect()
			sub.on('subscribed', function() {
				client.unsubscribe(sub)
			})
			sub.on('unsubscribed', function() {
				done()
			})
		})

		it('should unsubscribe the client from a stream when there are no more subscriptions for that stream', function(done) {
			var sub = client.subscribe("stream1", function(message) {})
			client.connect()

			client.socket.once('subscribed', function() {
				client.unsubscribe(sub)
			})

			client.socket.once('unsubscribed', function() {
				done()
			})
		})

		it('should not send another unsubscribed event if the same Subscription is unsubscribed multiple times', function(done) {
			var sub = client.subscribe("stream1", function(message) {})
			client.connect()

			client.socket.once('subscribed', function() {
				client.unsubscribe(sub)
			})

			client.socket.once('unsubscribed', function() {
				setTimeout(function() {
					client.unsubscribe(sub)
					done()
					client.socket.once('unsubscribed', function() {
						throw "Unsubscribed event sent more than once for same Subscription!"
					})
				})
			})
		})

		it('should not unsubscribe the client from a stream when there are subscriptions remaining for that stream', function(done) {
			var sub1 = client.subscribe("stream1", function(message) {})
			var sub2 = client.subscribe("stream1", function(message) {})
			client.connect()

			sub2.on('subscribed', function() {
				client.unsubscribe(sub2)
			})

			sub2.on('unsubscribed', function() {
				done()
			})

			client.socket.on('unsubscribed', function() {
				throw "Socket should not have unsubscribed"
			})

			sub1.on('unsubscribed', function() {
				throw "sub1 should not have unsubscribed"
			})
		})

		it('should not send an unsubscribe request again if unsubscribe is called multiple times', function(done) {
			var sub = client.subscribe("stream1", function(message) {})
			client.connect()

			client.socket.once('subscribed', function() {
				client.unsubscribe(sub)
				assert(sub.unsubscribing)
				client.unsubscribe(sub)
			})

			var count = 0
			client.socket.on('unsubscribe', function() {
				count++
			})

			client.socket.on('unsubscribed', function() {
				assert.equal(count, 1)
				assert(!sub.unsubscribing)
				done()
			})
		})

		it('should throw an error if no Subscription is given', function() {
			var sub = client.subscribe('stream1', function(message) {})
			client.connect()

			sub.on('subscribed', function() {
				assert.throws(function() {
					client.unsubscribe()
				})
			})
		})

		it('should throw error if Subscription is of wrong type', function() {
			var sub = client.subscribe("stream1", function(message) {})
			client.connect()

			sub.on('subscribed', function() {
				assert.throws(function() {
					client.unsubscribe('stream1')
				})
			})
		})

		it('should handle messages after resubscribing', function(done) {
			var sub = client.subscribe("stream1", function(message) {
				throw "This message handler should not be called"
			})
			client.connect()
			
			sub.on('subscribed', function() {
				client.unsubscribe(sub)
			})
			
			sub.on('unsubscribed', function() {
				var newSub = client.subscribe("stream1", function(message) {
					done()
				})
				newSub.on('subscribed', function() {
					client.socket.emit('b', msg("stream1", 0, {}))
				})
			})
		})

		it('should disconnect when no longer subscribed to any streams', function(done) {
			client.options.autoDisconnect = true

			var sub1 = client.subscribe("stream1", function(message) {})
			var sub2 = client.subscribe("stream2", function(message) {})
			client.connect()

			client.socket.on('subscribed', function(response) {
				if (sub1.isSubscribed() && sub2.isSubscribed()) {
					client.unsubscribe(sub1)
					client.unsubscribe(sub2)
				}
			})

			client.socket.on('disconnect', function() {
				assert(!sub1.isSubscribed())
				assert(!sub2.isSubscribed())
				done()
			})
		})

		it('should disconnect if all subscriptions are done during resend', function(done) {
			client.options.autoDisconnect = true

			var sub1 = client.subscribe("stream1", function(message) {}, {resend_all: true})
			client.connect()

			client.socket.on('resend', function(request) {
				async(function() {
					client.socket.emit('resending', {
						channel: request.channel, 
						sub: request.sub
					})
					client.socket.emit('b', byeMsg(request.channel,0))
					client.socket.emit('resent', {channel: request.channel, sub: request.sub})
				})
			})

			client.socket.on('disconnect', function() {
				done()
			})
		})

		it('should not disconnect if autoDisconnect is set to false', function(done) {
			client.options.autoDisconnect = false

			var sub1 = client.subscribe("stream1", function(message) {})
			var sub2 = client.subscribe("stream2", function(message) {})
			client.connect()

			client.socket.on('subscribed', function(response) {
				if (sub1.isSubscribed() && sub2.isSubscribed()) {
					client.unsubscribe(sub1)
					client.unsubscribe(sub2)
					done()
				}
			})

			client.socket.on('disconnect', function() {
				throw "Should not have disconnected!"
			})
		})
	})
	
	describe("disconnect", function() {

		it('should disconnect the socket', function(done) {
			client.connect()
			client.socket.disconnect = done

			client.socket.once('connect', function() {
				client.disconnect()
			})
		})

		it('should report that it is not connected and not connecting after disconnecting', function(done) {
			client.connect()

			client.socket.once('connect', function() {
				client.disconnect()
			})

			client.socket.once('disconnect', function() {
				assert(!client.isConnected())
				assert(!client.connecting)
				done()
			})
		})

		it('should reset subscriptions when calling disconnect()', function(done) {
			client.subscribe("stream1", function(message) {})
			client.connect()

			client.socket.once('subscribed', function() {
				client.disconnect()
			})

			client.socket.once('disconnect', function() {
				assert.equal(client.getSubscriptions('stream1').length, 0)
				done()
			})
		})

		it('should only subscribe to new subscriptions since calling disconnect()', function(done) {
			client.subscribe("stream1", function(message) {})
			client.connect()

			client.socket.once('subscribed', function() {
				client.disconnect()
			})

			client.socket.once('disconnect', function() {
				client.subscribe("stream2", function(message) {})
				client.connect()

				client.socket.once('subscribed', function(response) {
					if (response.channel === 'stream2')
						done()
					else throw "Unexpected response: "+JSON.stringify(response)
				})
			})
		})
	})

	describe("pause", function() {
		it('should disconnect the socket', function(done) {
			client.connect()

			client.socket.disconnect = done

			client.socket.once('connect', function() {
				client.pause()
			})
		})

		it('should report that its not connected after pausing', function(done) {
			client.connect()

			client.socket.once('connect', function() {
				client.pause()
			})

			client.socket.once('disconnect', function() {
				assert(!client.isConnected())
				done()
			})
		})

		it('should not reset subscriptions', function(done) {
			client.subscribe("stream1", function(message) {})
			client.connect()

			client.socket.once('subscribed', function() {
				client.pause()
			})

			client.socket.once('disconnect', function() {
				assert.equal(client.getSubscriptions('stream1').length, 1)
				done()
			})
		})

		it('should subscribe to both old and new subscriptions after pause-and-connect', function(done) {
			var sub1, sub2
			
			sub1 = client.subscribe("stream1", function(message) {})
			client.connect()
			
			client.socket.once('subscribed', function() {
				client.pause()	
			})

			client.socket.on('connect', function() {
				console.log("connect event")
			})

			client.socket.once('disconnect', function() {
				console.log("sub2")
				sub2 = client.subscribe("stream2", function(message) {})

				assert(!sub1.isSubscribed())
				assert(!sub2.isSubscribed())

				assert.equal(client.getSubscriptions('stream1').length, 1)
				assert.equal(client.getSubscriptions('stream2').length, 1)

				console.log("conn")
				client.connect()

				client.socket.on('subscribed', function(response) {
					if (sub1.isSubscribed() && sub2.isSubscribed())
						done()
				})
			})
		})
	})
	
	describe("resend", function() {
		var validResendRequests
		var resendLimits
		
		function checkResendRequest(request) {
			var el = validResendRequests[0]
			// all fields in the model request must be equal in actual request
			Object.keys(el).forEach(function(field) {
				if (request[field] !== el[field]) {
					throw "Resend request field "+field+" does not match expected value! Was: "+JSON.stringify(request)+", expected: "+JSON.stringify(el)
				}
			})
			validResendRequests.shift()
		}
		
		// Setup a resend response mock
		beforeEach(function() {
			validResendRequests = []
			resendLimits = {}

			function resend(channel, sub, from, to) {
				client.socket.emit('resending', {
					channel: channel, 
					sub: sub
				})
				for (var i=from;i<=to;i++) {
					client.socket.emit('u', msg(channel, i, {}, sub))
				}
				client.socket.emit('resent', {channel: channel, sub: sub})
			}

			socket.defaultResendHandler = function(request) {
				mockDebug("defaultResendHandler: "+JSON.stringify(request))

				// Check that the request is allowed
				checkResendRequest(request)

				async(function() {
					mockDebug("handling resend request: %o", request)
					if (request.resend_all) {
						if (resendLimits[request.channel]===undefined) {
							client.socket.emit('no_resend', {channel: request.channel, sub: request.sub})
						}
						else {
							resend(request.channel, request.sub, resendLimits[request.channel].from, resendLimits[request.channel].to)
						}
					}
					else if (request.resend_last) {
						if (resendLimits[request.channel] === undefined) {
							throw "Testing resend_last needs resendLimits.channel.to"
						}
						resend(request.channel, request.sub, resendLimits[request.channel].to - (request.resend_last - 1), resendLimits[request.channel].to)
					}
					else if (request.resend_from!=null && request.resend_to!=null) {
						resend(request.channel, request.sub, request.resend_from, request.resend_to)
					}
					else if (request.resend_from!=null) {
						if (resendLimits[request.channel] === undefined) {
							throw "Testing resend_from needs resendLimits.channel.to"
						}
						resend(request.channel, request.sub, request.resend_from, resendLimits[request.channel].to)
					}
					else if (request.resend_from_time!=null) {
						resend(request.channel, request.sub, 99, 100)
					}
					else {
						throw "Unknown kind of resend request: "+JSON.stringify(request)
					}
				})
			}
			socket.on('resend', socket.defaultResendHandler)
		})

		afterEach(function() {
			if (validResendRequests.length>0) {
				throw "resend requests remaining: "+JSON.stringify(validResendRequests)
			}
		})

		it('should recognize the resend_all option', function(done) {
			validResendRequests.push({channel:"stream1", resend_all:true})
			resendLimits["stream1"] = {from: 5, to: 10}
			client.subscribe("stream1", function(message) {}, {resend_all: true})
			client.connect()

			client.socket.once('resent', function() {
				done()
			})
		})

		it('should recognize the resend_from option', function(done) {
			validResendRequests.push({channel:"stream1", resend_from:7})
			resendLimits["stream1"] = {from: 5, to: 10}
			client.subscribe("stream1", function(message) {}, {resend_from: 7})
			client.connect()

			client.socket.once('resent', function() {
				done()
			})
		})

		it('should recognize the resend_last option', function(done) {
			validResendRequests.push({channel:"stream1", resend_last:3})
			resendLimits["stream1"] = {from: 5, to: 10}
			client.subscribe("stream1", function(message) {}, {resend_last: 3})
			client.connect()

			client.socket.once('resent', function() {
				done()
			})	
		})

		it('should recognize the resend_from_time option', function(done) {
			var d = Date.now()
			validResendRequests.push({channel:"stream1", resend_from_time:d})
			client.subscribe("stream1", function(message) {}, {resend_from_time: d})
			client.connect()

			client.socket.once('resent', function() {
				done()
			})	
		})

		it('should recognize the resend_from_time option given as a Date object', function(done) {
			var d = new Date()
			validResendRequests.push({channel:"stream1", resend_from_time:d.getTime()})
			client.subscribe("stream1", function(message) {}, {resend_from_time: d})
			client.connect()

			client.socket.once('resent', function() {
				done()
			})	
		})

		it('should throw if resend_from_time is in invalid format', function() {
			assert.throws(function() {
				client.subscribe("stream1", function(message) {}, {resend_from_time: "invalid"})
			})
		})

        it('should not emit a resend request if there is no gap in messages', function(done) {
            client.subscribe("stream1", function(message) {
                if (message.done) {
                    done()
                }
            })
            client.connect()

            socket.once('resend', function(req) {
                throw "Should not have made a resend request:" + JSON.stringify(req)
            })

            client.socket.once('subscribed', function() {
                client.socket.emit('b', msg("stream1", 0))
                client.socket.emit('b', msg("stream1", 10, {done: true}, undefined, 0))
            })
        })

		it('should emit a resend request if there is a gap in messages', function(done) {
			client.subscribe("stream1", function(message) {})
			client.connect()
			
			validResendRequests.push({channel:"stream1", resend_from:1, resend_to:9})

			client.socket.once('subscribed', function() {
				client.socket.emit('b', msg("stream1", 0))
				client.socket.emit('b', msg("stream1", 10, {}, undefined, 9))
			})

			client.socket.once('resent', function() {
				done()
			})
		})

		it('should include any subscription options in resend request', function(done) {
			client.subscribe("stream1", function(message) {}, {auth:'foo'})
			client.connect()

			validResendRequests.push({channel:"stream1", resend_from:1, resend_to:9})

			client.socket.once('subscribed', function() {
				client.socket.emit('b', msg("stream1", 0))
				client.socket.emit('b', msg("stream1", 10, {}, undefined, 9))
			})

			client.socket.once('resend', function(request) {
				assert.equal(request.auth, 'foo')
			})

			client.socket.once('resent', function() {
				done()
			})
		})

		it('should not include stronger resend requests in gap resend request', function(done) {
			client.subscribe("stream1", function(message) {}, {auth:'foo', resend_all: true})
			client.connect()

			validResendRequests.push({channel:"stream1", resend_all:true})
			validResendRequests.push({channel:"stream1", resend_from:1, resend_to:1})

			client.socket.once('subscribed', function() {
				client.socket.emit('b', msg("stream1", 0))
				client.socket.emit('b', msg("stream1", 2, {}, undefined, 1))
			})

			client.socket.on('resend', function(request) {
				if (request.resend_from)
					assert.equal(request.resend_all, undefined)
			})

			client.socket.once('resent', function() {
				done()
			})
		})
		
		it('should not emit another resend request while waiting for resend', function(done) {
			validResendRequests.push({channel:"stream1", resend_from:1, resend_to:9})

			client.subscribe("stream1", function(message) {})
			client.connect()

			client.socket.once('subscribed', function() {
				client.socket.emit('b', msg("stream1", 0))
				client.socket.emit('b', msg("stream1", 10, {}, undefined, 9))
				client.socket.emit('b', msg("stream1", 11, {}, undefined, 10))
			})

			var counter = 0
			client.socket.on('resend', function() {
				counter++
			})
			
			client.socket.once('resent', function() {
				assert.equal(counter, 1)
				done()
			})
		})
		
		it('should process queued messages when the resend is complete', function(done) {
			client.subscribe("stream1", function(message) {
				if (message.counter===12)
					done()
			})
			client.connect()
	
			validResendRequests.push({channel:"stream1", resend_from:1, resend_to:9})

			client.socket.once('subscribed', function() {
				client.socket.emit('b', msg("stream1", 0, {counter: 0}))
				client.socket.emit('b', msg("stream1",10, {counter: 10}, undefined, 9))
				client.socket.emit('b', msg("stream1",11, {counter: 11}))
				client.socket.emit('b', msg("stream1",12, {counter: 12}))
			})
		})
		
		it('should ignore retransmissions in the queue', function(done) {
			client.subscribe("stream1", function(message) {
				if (message.counter===12)
					done()
			})
			client.connect()
	
			validResendRequests.push({channel:"stream1", resend_from:1, resend_to:9})

			client.socket.once('subscribed', function() {
				client.socket.emit('b', msg("stream1", 0, {counter: 0}))
				client.socket.emit('b', msg("stream1", 10, {counter: 10}, undefined, 9))
				client.socket.emit('b', msg("stream1", 11, {counter: 11}, undefined, 10))
				client.socket.emit('b', msg("stream1", 11, {counter: 11}, undefined, 10)) // bogus message
				client.socket.emit('b', msg("stream1", 5, {counter: 5}, undefined, 4)) // bogus message
				client.socket.emit('b', msg("stream1", 12, {counter: 12}, undefined, 11))
			})
		})
		
		it('should do another resend request if there are gaps in the queue', function(done) {
			client.subscribe("stream1", function(message, streamId, timetamp, counter) {
				if (counter===12)
					done()
			})
			client.connect()
	
			validResendRequests.push({channel:"stream1", resend_from:1, resend_to:9})
			validResendRequests.push({channel:"stream1", resend_from:11, resend_to:11})
			
			client.socket.once('subscribed', function() {
				client.socket.emit('b', msg("stream1", 0, {counter: 0}))
				client.socket.emit('b', msg("stream1", 10, {counter: 10}, undefined, 9))
				client.socket.emit('b', msg("stream1", 12, {counter: 12}, undefined, 11))
			})
		})

		describe('on reconnect', function() {
			var msgHandler
			beforeEach(function() {
				msgHandler = sinon.spy()
			})

			it('no resend', function(done) {
				client.subscribe("stream", msgHandler)
				client.connect()

				client.socket.on('subscribed', function(response) {
					client.socket.emit('b', msg("stream", 0))
					client.socket.emit('disconnect')
				})

				client.socket.once('disconnect', function() {
					client.connect()

					socket.on('resend', function() {
						throw "Should not have made a resend request!"
					})

					socket.on('subscribed', function() {
						assert.equal(msgHandler.callCount, 1)
						done()
					})
				})
			})

			it('resend_all', function(done) {
				validResendRequests.push({channel:"stream", resend_all: true})
				resendLimits["stream"] = {
					from: 0,
					to: 5
				}

				client.subscribe("stream", msgHandler, { resend_all: true })
				client.connect()

				client.socket.on('subscribed', function(response) {
					client.socket.emit('disconnect')
				})

				client.socket.once('disconnect', function() {
					client.connect()

					socket.on('resend', function(request) {
						assert.equal(request.resend_from, 6)
						assert.equal(request.resend_to, undefined)
						done()
					})
				})
			})

			it('resend_from', function(done) {
				validResendRequests.push({channel:"stream", resend_from: 3})
				resendLimits["stream"] = {
					from: 0,
					to: 5
				}

				client.subscribe("stream", msgHandler, { resend_from: 3 })
				client.connect()

				client.socket.on('subscribed', function(response) {
					client.socket.emit('disconnect')
				})

				client.socket.once('disconnect', function() {
					client.connect()

					socket.on('resend', function(request) {
						assert.equal(request.resend_from, 6)
						assert.equal(request.resend_to, undefined)
						done()
					})
				})
			})

			it('resend_last', function(done) {
				validResendRequests.push({channel:"stream", resend_last: 1})
				resendLimits["stream"] = {
					from: 0,
					to: 5
				}

				client.subscribe("stream", msgHandler, { resend_last: 1 })
				client.connect()

				client.socket.on('subscribed', function(response) {
					client.socket.emit('disconnect')
				})

				client.socket.once('disconnect', function() {
					client.connect()

					socket.on('resend', function(request) {
						assert.equal(request.resend_last, 1)
						done()
					})
				})
			})

			it('resend_last should accept a gap on reconnect', function(done) {
				validResendRequests.push({channel:"stream", resend_last: 1})
				resendLimits["stream"] = {
					from: 0,
					to: 0
				}

				client.subscribe("stream", msgHandler, { resend_last: 1 })
				client.connect()

				client.socket.on('subscribed', function(response) {
					socket.off('resend', socket.defaultResendHandler)
					client.socket.emit('disconnect')
				})

				client.socket.once('disconnect', function() {
					client.connect()

					socket.on('resend', function(request) {
						assert.equal(request.resend_last, 1)
						client.socket.emit('resending', {
							channel: request.channel,
							sub: request.sub
						})
						client.socket.emit('u', msg(request.channel, 10, {}, request.sub, 9))
						client.socket.emit('resent', {channel: request.channel, sub: request.sub})
						assert.equal(msgHandler.callCount, 2)
						done()
					})
				})
			})
		})

	})

	describe("Subscription", function() {
		it('should trigger a subscribed event on subscribed', function(done) {
			var subscribeCount = 0

			var sub1 = client.subscribe("stream1", function(message) {})
			var sub2 = client.subscribe("stream2", function(message) {})
			var check = function(response) {
				if (++subscribeCount === 2)
					done()
			}
			sub1.on('subscribed', check)
			sub2.on('subscribed', check)

			client.connect()
		})

		it('should trigger an unsubscribed event on unsubscribed', function(done) {
			var count = 0
			var check = function(response) {
				if (++count===2)
					done()
			}

			var sub1 = client.subscribe("stream1", function(message) {})
			var sub2 = client.subscribe("stream2", function(message) {})
			sub1.on('unsubscribed', check)
			sub2.on('unsubscribed', check)

			client.connect()

			client.socket.on('subscribed', function() {
				if (sub1.isSubscribed() && sub2.isSubscribed()) {
					client.unsubscribe(sub1)
					client.unsubscribe(sub2)
				}
			})
		})
	})

	describe("client events", function() {
		it('should trigger a connected event on connect', function(done) {
			client.on('connected', function() {
				done()
			})
			client.connect()
		})

		it('should trigger a disconnected event on disconnect', function(done) {
			client.on('disconnected', function() {
				done()
			})
			client.connect()
			client.socket.once('connect', function() {
				client.disconnect()
			})
		})
	})

})

