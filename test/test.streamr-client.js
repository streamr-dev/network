var assert = require('assert')

global.window = {

}

global.Streamr = {

}

function Eventor() {
	var listeners = {}
	return {
		on: function(en, cb) {
			if (!listeners[en])
				listeners[en] = [cb]
			else listeners[en].push(cb)
		},
		off: function() {},
		trigger: function(e, d) {
			if (listeners[e]) {
				listeners[e].forEach(function(cb) {
					cb(d)
				})
			}
		}
	}
}

var StreamrClient = require('../streamr-client').StreamrClient

var STREAM_KEY = "_S"
var COUNTER_KEY = "_C"
var BYE_KEY = "_bye"

describe('StreamrClient', function() {
	var client
	var socket

	function msg(stream, counter, content) {
		var msg = {}
		msg[STREAM_KEY] = stream
		msg[COUNTER_KEY] = counter
		if (content)
			Object.keys(content).forEach(function(key) {
				msg[key] = content[key]
			})

		return msg
	}

	function byeMsg(stream, counter) {
		var bye = {}
		bye[BYE_KEY] = true
		return msg(stream, counter, bye)
	}

	beforeEach(function() {
		
		global.$ = function(o) {

		}
		
		global.$.extend = function(o) {
			return o
		}
		
		global.io = function() {
			socket = new Eventor()
			socket.emit = function() {}
			socket.disconnect = function() {}
			return socket
		}

		client = new StreamrClient()
	})

	describe("connect", function() {
		it('should emit pending subscribes on comment', function(done) {
			var subscription = client.subscribe("stream1", function(message) {})
			client.connect()

			client.socket.emit = function(e, request) {
				if (e==='subscribe' && request.channel==='stream1')
					done()
			}
			client.socket.trigger('connect')
		})

		it('should not emit anything on connect if not subscribed to anything', function(done) {
			client.connect()

			client.socket.emit = function(e, subscriptions) {
				throw "Unexpected emit!"
			}
			client.socket.trigger('connect')
			done()
		})

		it('should report that its connected after connecting', function(done) {
			client.connect()
			client.socket.trigger('connect')

			assert(client.isConnected())
			done()
		})

		it('should not try to connect while connecting', function(done) {
			var oldIo = global.io
			var ioCalls = 0

			global.io = function() {
				ioCalls++
				if (ioCalls>1)
					throw "Too many io() calls!"
				return oldIo()
			}

			client.options.autoConnect = true
			client.subscribe("stream1", function(message) {})
			client.subscribe("stream2", function(message) {})

			assert.equal(ioCalls, 1)
			done()
		})
	})

	describe("reconnect", function() {
		it('should emit a subscribe event on reconnect', function(done) {
			var subscription = client.subscribe("stream1", function(message) {})
			client.connect()

			client.socket.emit = function(e, request) {
				if (e==='subscribe' && request.channel==='stream1')
					done()
			}

			client.socket.trigger('disconnect')
			client.socket.trigger('connect')
		})

		it('should not emit a subscribe event for unsubscribed streams on reconnect', function(done) {
			client.subscribe("stream1", function(message) {})
			client.subscribe("stream2", function(message) {})
			client.connect()

			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel: "stream1", from: 0})
			client.socket.trigger('subscribed', {channel: "stream2", from: 0})

			client.socket.trigger('ui', byeMsg("stream1", 0))
			client.socket.trigger('unsubscribed', {channel:"stream1"})

			client.socket.emit = function(e, request) {
				if (e==='subscribe' && request.channel==="stream1")
					throw "Should not have subscribed to stream1 on reconnect!"
			}
			client.socket.trigger('disconnect')
			client.socket.trigger('connect')
			done()
		})

		it('should emit a subscribe event on reconnect for topics subscribed after initial connect', function(done) {
			client.connect()
			client.socket.trigger('connect')

			client.subscribe("stream1", function(message) {})

			client.socket.emit = function(e, request) {
				if (e==='subscribe' && request.channel==='stream1')
					done()
			}
			client.socket.trigger('disconnect')
			client.socket.trigger('connect')
		})
	})

	describe("subscribe", function() {
		it('should emit a subscribe event when subscribing after connecting', function(done) {
			client.connect()
			client.socket.trigger('connect')

			client.socket.emit = function(e, request) {
				if (e==='subscribe' && request.channel==='stream1')
					done()
			}
			client.subscribe("stream1", function(message) {})
		})

		it('should mark channels as subscribed when the server responds with subscribed', function(done) {
			var subscription = client.subscribe("stream1", function(message) {})
			client.connect()
			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel: "stream1"})
			assert(subscription.subscribed)
			done()
		})

		it('should connect if autoConnect is set to true', function(done) {
			client.options.autoConnect = true
			client.connect = done
			client.subscribe("stream1", function(message) {})
		})

		it('should set the expected counter to what the subscribed message says', function(done) {
			var sub = client.subscribe("stream1", function(message) {})
			client.connect()
			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel:'stream1', from:2})
			assert.equal(sub.counter, 2)
			done()
		})

	})

	describe("subscribe with resend options", function() {

		it('should emit a resend request', function(done) {
			client.subscribe("stream1", function(message) {}, {resend_all:true})
			client.connect()

			client.socket.emit = function(e, request) {
				if (e==='resend' && request.resend_all)
					done()
			}
			client.socket.trigger('connect')
		})

		it('should throw an error if multiple resend options are given', function() {
			assert.throws(function() {
				client.subscribe("stream1", function(message) {}, {resend_all:true, resend_last:5})
			})
		})
	})

	describe("message handling", function() {
		it('should call the callback when a message is received with correct counter', function(done) {
			var subscription = client.subscribe("stream1", function(message) {
				done()
			})
			client.connect()
			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel:'stream1', from:0})

			// Fake message
			client.socket.trigger('ui', msg("stream1", 0))
		})

		it('should not call the callback nor throw an exception when a message is re-received', function(done) {
			var callbackCounter = 0
			var subscription = client.subscribe("stream1", function(message) {
				callbackCounter++
				if (callbackCounter>1)
					throw "Callback called more than once!"
			})
			client.connect()
			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel:'stream1', from:0})
			
			// Fake messages
			client.socket.trigger('ui', msg("stream1",0))
			client.socket.trigger('ui', msg("stream1",0))
			client.socket.trigger('ui', msg("stream1",0))
			done()
		})
		
		it('should call the callback once for each message in order', function(done) {
			var count = 0
			var subscription = client.subscribe("stream1", function(message) {
				console.log("Count: "+count+", message: "+message.count)
				
				if (message.count !== count)
					throw "Message counter: "+message.count+", expected: "+count
					
				if (++count === 3)
					done()
			})
			client.connect()
			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel:'stream1', from:0})
			
			client.socket.trigger('ui', msg("stream1", 0, {count:0}))
			client.socket.trigger('ui', msg("stream1", 1, {count:1}))
			client.socket.trigger('ui', msg("stream1", 2, {count:2}))
		})

		it('should emit unsubscribe after processing a message with the bye key', function(done) {
			var processed = false
			var subscription = client.subscribe("stream1", function(message) {
				processed = true
			})
			client.connect()
			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel:'stream1', from:0})
			
			client.socket.emit = function(event, options) {
				if (event==='unsubscribe' && processed && options.channel==='stream1')
					done()
				else throw "Unexpected emission: "+event+": "+JSON.stringify(options)
			}

			// Fake message
			client.socket.trigger('ui', byeMsg("stream1", 0))
		})
	})

	describe("unsubscribe", function() {
		it('should remove streams on unsubscribed', function(done) {
			var subscription = client.subscribe("stream1", function(message) {})
			client.connect()
			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel:'stream1', from:0})
			
			// Fake message
			client.socket.trigger('ui', byeMsg("stream1", 0))
			client.socket.trigger('unsubscribed', {channel: 'stream1'})
			assert(!client.streams['stream1'])
			done()
		})

		it('should handle messages after resubscribing', function(done) {
			var subscription = client.subscribe("stream1", function(message) {})
			client.connect()
			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel:'stream1', from:0})
			
			// Fake message
			client.unsubscribe('stream1')
			client.socket.trigger('unsubscribed', {channel: 'stream1'})
			assert(!client.streams['stream1'])

			subscription = client.subscribe("stream1", function(message) {
				done()
			})
			client.socket.trigger('subscribed', {channel:'stream1', from:0})
			client.socket.trigger('ui', msg("stream1", 0, {}))
		})
	})
	
	describe("disconnect", function() {

		it('should disconnect when no longer subscribed to any streams', function(done) {
			client.subscribe("stream1", function(message) {})
			client.subscribe("stream2", function(message) {})
			client.connect()
			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel:'stream1', from:0})
			client.socket.trigger('subscribed', {channel:'stream2', from:0})

			// Must not disconnect yet
			client.socket.disconnect = function() {
				throw "Disconnected too early!"
			}
			client.socket.trigger('ui', byeMsg("stream1", 0))
			client.socket.trigger('unsubscribed', {channel: 'stream1'})

			client.socket.trigger('ui', byeMsg("stream2", 0))
			client.socket.disconnect = function() {
				done()
			}
			client.socket.trigger('unsubscribed', {channel: 'stream2'})
		})

		it('should not disconnect if autoDisconnect is set to false', function(done) {
			client.options.autoDisconnect = false

			client.subscribe("stream1", function(message) {})
			client.subscribe("stream2", function(message) {})
			client.connect()
			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel:'stream1', from:0})
			client.socket.trigger('subscribed', {channel:'stream2', from:0})

			// Must not disconnect
			client.socket.disconnect = function() {
				throw "Should not have disconnected!"
			}
			client.socket.trigger('ui', byeMsg("stream1", 0))
			client.socket.trigger('unsubscribed', {channel: 'stream1'})

			client.socket.trigger('ui', byeMsg("stream2", 0))

			client.socket.trigger('unsubscribed', {channel: 'stream2'})
			done()
		})

		it('should disconnect the socket when disconnected', function(done) {
			client.subscribe("stream1", function(message) {})
			client.connect()
			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel:'stream1', from:0})

			client.socket.disconnect = done
			client.disconnect()
		})

		it('should reset subscriptions when calling disconnect()', function(done) {
			client.subscribe("stream1", function(message) {})
			client.connect()
			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel:'stream1', from:0})

			client.disconnect()
			assert.equal(Object.keys(client.streams).length, 0)
			done()
		})

		it('should report that it is not connected after disconnecting', function(done) {
			client.subscribe("stream1", function(message) {})
			client.connect()
			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel:'stream1', from:0})

			client.disconnect()
			client.socket.trigger('disconnect')
			assert(!client.isConnected())
			done()
		})

		it('should only subscribe to new subscriptions since calling disconnect()', function(done) {
			client.subscribe("stream1", function(message) {})
			var streams = client.connect()
			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel:'stream1', from:0})

			client.disconnect()
			client.socket.trigger('disconnect')
			
			client.subscribe("stream2", function(message) {})
			streams = client.connect()

			socket.emit = function(e, request) {
				if (e==='subscribe' && request.channel==='stream2')
					done()
				else throw "Unexpected request: "+JSON.stringify(request)
			}
			socket.trigger('connect')
		})
	})

	describe("pause", function() {
		it('should disconnect the socket', function(done) {
			client.subscribe("stream1", function(message) {})
			client.connect()
			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel:'stream1', from:0})

			client.socket.disconnect = done
			client.pause()
		})

		it('should not reset subscriptions', function(done) {
			client.subscribe("stream1", function(message) {})
			client.connect()
			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel:'stream1', from:0})

			client.pause()
			assert.equal(Object.keys(client.streams).length, 1)
			done()
		})

		it('should report that its not connected after pausing', function(done) {
			client.subscribe("stream1", function(message) {})
			client.connect()
			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel:'stream1', from:0})

			client.pause()
			client.socket.trigger('disconnect')
			assert(!client.isConnected())
			done()
		})

		it('should subscribe to both old and new subscriptions after pause-and-connect', function(done) {
			client.subscribe("stream1", function(message) {})
			var streams = client.connect()
			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel:'stream1', from:0})

			client.pause()
			client.socket.trigger('disconnect')
			
			client.subscribe("stream2", function(message) {})
			streams = client.connect()

			var stream1sub = false
			var stream2sub = false
			socket.emit = function(e, request) {
				if (e==='subscribe' && request.channel==='stream1')
					stream1sub = true
				else if (e==='subscribe' && request.channel==='stream2')
					stream2sub = true

				if (stream1sub && stream2sub)
					done()
			}
			socket.trigger('connect')
		})
	})
	
	describe("resend", function() {
		var validResendRequests
		var resendRequestCount
		
		function checkResendRequest(options, idx) {
			var el = validResendRequests[idx]
			assert.deepEqual(el,options)
			return true
		}

		function resendCheckingEmitter(event, options) {
			if (event==="resend") {
				// Check that the request is allowed
				checkResendRequest(options, resendRequestCount++)

				setTimeout(function() {
					client.socket.trigger('resending', {channel: options.channel, from:options.resend_from, to:options.resend_to})
					for (var i=options.resend_from;i<=options.resend_to;i++) {
						client.socket.trigger('ui', msg(options.channel,i))
					}
					client.socket.trigger('resent', {channel: options.channel, from:options.resend_from, to:options.resend_to})
				}, 0)
			}
		}
		
		// Setup a resend response mock
		beforeEach(function() {
			validResendRequests = []
			resendRequestCount = 0
		})
		
		it('should emit a resend request if the first message is not the expected one', function(done) {
			client.subscribe("stream1", function(message) {})
			client.connect()
			client.socket.trigger('connect')
			
			validResendRequests.push({channel:"stream1", resend_from:0, resend_to:1})
			client.socket.emit = function(event, options) {
				checkResendRequest(options,0)
				done()
			}

			client.socket.trigger('subscribed', {channel:'stream1', from:0})
			client.socket.trigger('ui', msg("stream1",2))
		})
		
		it('should emit a resend request if there is a gap in messages', function(done) {
			var subscription = client.subscribe("stream1", function(message) {})
			client.connect()
			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel:'stream1', from:0})
			
			validResendRequests.push({channel:"stream1", resend_from:1, resend_to:9})
			client.socket.emit = function(event, options) {
				checkResendRequest(options,0)
				done()
			}
			
			client.socket.trigger('ui', msg("stream1",0))
			client.socket.trigger('ui', msg("stream1",10))
		})
		
		it('should not emit another resend request while waiting for resend', function(done) {
			var subscription = client.subscribe("stream1", function(message) {})
			client.connect()
			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel:'stream1', from:0})
	
			var emitCounter = 0
			client.socket.emit = function(event, options) {
				emitCounter++
			}
			
			client.socket.trigger('ui', msg("stream1",0))
			client.socket.trigger('ui', msg("stream1",10))
			client.socket.trigger('ui', msg("stream1",11))
			if (emitCounter!==1)
				throw "emitCounter is "+emitCounter+", expected 1"
			else done()
		})
		
		it('should process queued messages when the resend is complete', function(done) {
			var subscription = client.subscribe("stream1", function(message) {
				if (message.counter===12)
					done()
			})
			client.connect()
			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel:'stream1', from:0})
	
			validResendRequests.push({channel:"stream1", resend_from:1, resend_to:9})
			client.socket.emit = resendCheckingEmitter

			client.socket.trigger('ui', msg("stream1", 0, {counter: 0}))
			client.socket.trigger('ui', msg("stream1",10, {counter: 10}))
			client.socket.trigger('ui', msg("stream1",11, {counter: 11}))
			client.socket.trigger('ui', msg("stream1",12, {counter: 12}))
		})
		
		it('should ignore retransmissions in the queue', function(done) {
			var subscription = client.subscribe("stream1", function(message) {
				if (message.counter===12)
					done()
			})
			client.connect()
			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel:'stream1', from:0})
	
			validResendRequests.push({channel:"stream1", resend_from:1, resend_to:9})
			client.socket.emit = resendCheckingEmitter

			client.socket.trigger('ui', msg("stream1", 0, {counter: 0}))
			client.socket.trigger('ui', msg("stream1", 10, {counter: 10}))
			client.socket.trigger('ui', msg("stream1", 11, {counter: 11}))
			client.socket.trigger('ui', msg("stream1", 11, {counter: 11})) // bogus message
			client.socket.trigger('ui', msg("stream1", 5, {counter: 5})) // bogus message
			client.socket.trigger('ui', msg("stream1", 12, {counter: 12}))
		})
		
		it('should do another resend request if there are gaps in the queue', function(done) {
			var subscription = client.subscribe("stream1", function(message) {
				if (message.counter===12)
					done()
			})
			client.connect()
			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel:'stream1', from:0})
	
			validResendRequests.push({channel:"stream1", resend_from:1, resend_to:9})
			validResendRequests.push({channel:"stream1", resend_from:11, resend_to:11})
			client.socket.emit = resendCheckingEmitter

			client.socket.trigger('ui', msg("stream1", 0, {counter: 0}))
			client.socket.trigger('ui', msg("stream1", 10, {counter: 10}))
			client.socket.trigger('ui', msg("stream1", 12, {counter: 12}))
		})
		
		it('should re-request from the latest counter on reconnect', function(done) {
			client.subscribe("stream1", function(message) {}, {resend_all:true})
			client.subscribe("stream2", function(message) {}, {resend_from:0})
			client.subscribe("stream3", function(message) {}) // no resend for stream3
			client.connect()
			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel:'stream1', from:0})
			client.socket.trigger('subscribed', {channel:'stream2', from:0})
			client.socket.trigger('subscribed', {channel:'stream3', from:0})
			
			client.socket.trigger('ui', msg("stream1",0))
			client.socket.trigger('ui', msg("stream1",1))
			client.socket.trigger('ui', msg("stream1",2))
			
			client.socket.trigger('ui', msg("stream2",0))
			client.socket.trigger('ui', msg("stream3",0))
			
			var s1sub = false
			var s2sub = false
			client.socket.emit = function(event, request) {		
				if (event==="subscribe" && request.channel === 'stream1' && request.from === 3) {
					s1sub = true

					if (s1sub && s2sub)
						done()
				}
				else if (event==="subscribe" && request.channel === 'stream2' && request.from === 1) {
					s2sub = true

					if (s1sub && s2sub)
						done()
				}
				else if (event==="subscribe" && request.channel === 'stream3' && request.from !== undefined)
					throw "Should not specified the from field for stream3: "+request.from


			}
			
			client.socket.trigger('disconnect')
			client.socket.trigger('connect')
		})


	})

	describe("Subscription", function() {
		it('should trigger a subscribed event on subscribed', function(done) {
			var subscribeCount = 0

			var sub1 = client.subscribe("stream1", function(message) {}, {resend_all:true})
			var sub2 = client.subscribe("stream2", function(message) {}, {resend_all:true})
			var check = function(response) {
				if (++subscribeCount === 2)
					done()
			}
			sub1.bind('subscribed', check)
			sub2.bind('subscribed', check)

			client.connect()
			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel:'stream1', from:0})
			client.socket.trigger('subscribed', {channel:'stream2', from:0})
		})

		it('should trigger an unsubscribed event on unsubscribed', function(done) {
			var count = 0
			var check = function(response) {
				if (++count===2)
					done()
			}

			var sub1 = client.subscribe("stream1", function(message) {})
			var sub2 = client.subscribe("stream2", function(message) {})
			sub1.bind('unsubscribed', check)
			sub2.bind('unsubscribed', check)

			client.connect()

			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel:'stream1', from:0})
			client.socket.trigger('subscribed', {channel:'stream2', from:0})

			client.socket.trigger('unsubscribed', {channel:"stream1"})
			client.socket.trigger('unsubscribed', {channel:"stream2"})
		})
	})

	describe("client events", function() {
		it('should trigger a connected event on connect', function(done) {
			client.bind('connected', function() {
				done()
			})
			client.connect()
			client.socket.trigger('connect')
		})

		it('should trigger a disconnected event on disconnect', function(done) {
			client.bind('disconnected', function() {
				done()
			})
			client.connect()
			client.socket.trigger('connect')
			client.disconnect()
			client.socket.trigger('disconnect')
		})

		it('should trigger a subscribed event on subscribed', function(done) {
			var subscribeCount = 0
			client.bind('subscribed', function(response) {
				if (++subscribeCount === 2)
					done()
			})
			client.subscribe("stream1", function(message) {}, {resend_all:true})
			client.subscribe("stream2", function(message) {}, {resend_all:true})
			client.connect()
			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel:'stream1', from:0})
			client.socket.trigger('subscribed', {channel:'stream2', from:0})
		})

		it('should trigger an unsubscribed event on unsubscribed', function(done) {
			var count = 0
			client.bind('unsubscribed', function(response) {
				if (++count===2)
					done()
			})
			client.subscribe("stream1", function(message) {})
			client.subscribe("stream2", function(message) {})
			client.connect()

			client.socket.trigger('connect')
			client.socket.trigger('subscribed', {channel:'stream1', from:0})
			client.socket.trigger('subscribed', {channel:'stream2', from:0})

			client.socket.trigger('unsubscribed', {channel:"stream1"})
			client.socket.trigger('unsubscribed', {channel:"stream2"})
		})
	})
})

