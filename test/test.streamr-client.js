var assert = require('assert'),
	events = require('eventemitter2')

global.window = {

}

global.Streamr = {

}

var StreamrClient = require('../streamr-client').StreamrClient

var STREAM_KEY = "_S"
var COUNTER_KEY = "_C"
var BYE_KEY = "_bye"

describe('StreamrClient', function() {
	var client
	var socket
	var asyncs = []

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

	function createSocketMock() {
		var s = new events.EventEmitter2

		s.disconnect = function() {
			async(function() {
				s.emit('disconnect')
			})
		}

		s.defaultSubscribeHandler = function(request) {
			async(function() {
				s.emit('subscribed', {channel: request.channel, from: 0})	
			})
		}
		s.on('subscribe', s.defaultSubscribeHandler)

		s.defaultUnsubscribeHandler = function(request) {
			async(function() {
				s.emit('unsubscribed', {channel: request.channel})	
			})
		}
		s.on('unsubscribe', s.defaultUnsubscribeHandler)

		return s
	}

	beforeEach(function() {
		clearAsync()

		global.$ = function(o) {

		}
		
		global.$.extend = function(o) {
			return o
		}
		
		socket = createSocketMock()

		var ioCalls = 0
		global.io = function() {
			ioCalls++

			// Create new sockets for subsequent calls
			if (ioCalls > 1) {
				socket = createSocketMock()
			}

			async(function() {
				socket.emit('connect')
			})

			return socket
		}

		client = new StreamrClient()
		client.options.autoConnect = false
		client.options.autoDisconnect = false
	})

	describe("connect", function() {
		it('should emit pending subscribes on comment', function(done) {
			var subscription = client.subscribe("stream1", function(message) {})
			client.connect()

			client.socket.on('subscribe', function(request) {
				if (request.channel==='stream1')
					done()
			})
		})

		it('should not emit anything on connect if not subscribed to anything', function(done) {
			client.connect()

			client.socket.onAny(function() {
				if (this.event !== 'connect')
					throw "Unexpected emit: "+this.event
			})

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

			// connect-disconnect-connect
			client.socket.once('connect', function() {
				client.socket.once('disconnect', function() {
					client.socket.on('subscribe', function(request) {
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
					client.unsubscribe('stream1')
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
				client.subscribe()
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

		it('should mark channels as subscribed when the server responds with subscribed', function(done) {
			var subscription = client.subscribe("stream1", function(message) {})
			client.connect()

			client.socket.once('subscribed', function() {
				assert(subscription.isSubscribed())
				done()
			})
		})

		it('should connect if autoConnect is set to true', function(done) {
			client.options.autoConnect = true
			client.connect = done
			client.subscribe("stream1", function(message) {})
		})

		it('should set the expected counter to what the subscribed message says', function(done) {
			var sub = client.subscribe("stream1", function(message) {})
			client.connect()

			client.socket.removeListener('subscribe', client.socket.defaultSubscribeHandler)
			client.socket.on('subscribe', function(request) {
				async(function() {
					client.socket.emit('subscribed', {channel:'stream1', from:2})
				})
			})

			client.socket.once('subscribed', function(response) {
				assert.equal(sub.counter, 2)
				done()
			})
		})

	})

	describe("subscribe with resend options", function() {

		it('should emit a resend request', function(done) {
			client.subscribe("stream1", function(message) {}, {resend_all:true})
			client.connect()

			client.socket.once('resend', function(request) {
				if (request.resend_all)
					done()
				else throw "Unexpected resend request: "+JSON.stringify(request)
			})
		})

		it('should throw an error if multiple resend options are given', function() {
			assert.throws(function() {
				client.subscribe("stream1", function(message) {}, {resend_all:true, resend_last:5})
			})
		})

		it('should subscribe to the channel after resent', function(done) {
			client.subscribe("stream1", function(message) {}, {resend_all:true})
			client.connect()

			client.socket.once('resend', function(request) {
				async(function() {
					client.socket.emit('resending', {channel:'stream1', from:0 ,to:1})
					client.socket.emit('ui', msg('stream1', 0))
					client.socket.emit('ui', msg('stream1', 1))
					client.socket.emit('resent', {channel:'stream1', from:0, to:1})
				})

				client.socket.once('subscribe', function(request) {
					assert.equal(request.from, 2)
					done()
				})
			})
		})

		it('should subscribe to the channel after no_resend', function(done) {
			client.subscribe("stream1", function(message) {}, {resend_all:true})
			client.connect()

			client.socket.once('resend', function(request) {
				async(function() {
					client.socket.emit('no_resend', {channel:'stream1', next:7})
				})

				client.socket.once('subscribe', function(request) {
					assert.equal(request.from, 7)
					done()
				})
			})
		})
	})

	describe("message handling", function() {
		it('should call the callback when a message is received with correct counter', function(done) {
			var sub = client.subscribe("stream1", function(message) {
				done()
			})
			client.connect()
			client.socket.once('subscribed', function() {
				client.socket.emit('ui', msg("stream1", 0))
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
				client.socket.emit('ui', msg("stream1",0))
				client.socket.emit('ui', msg("stream1",0))
				client.socket.emit('ui', msg("stream1",0))
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
				client.socket.emit('ui', msg("stream1", 0, {count:0}))
				client.socket.emit('ui', msg("stream1", 1, {count:1}))
				client.socket.emit('ui', msg("stream1", 2, {count:2}))
			})
		})

		it('should emit unsubscribe after processing a message with the bye key', function(done) {
			var processed = false
			client.subscribe("stream1", function(message) {
				processed = true
			})
			client.connect()

			client.socket.once('subscribed', function() {
				client.socket.emit('ui', byeMsg("stream1", 0))
			})

			client.socket.once('unsubscribed', function(response)  {
				if (processed && response.channel==='stream1')
					done()
			})
		})
	})

	describe("unsubscribe", function() {
		it('should remove streams on unsubscribed', function(done) {
			client.subscribe("stream1", function(message) {})
			client.connect()

			client.socket.once('subscribed', function() {
				client.unsubscribe('stream1')
			})

			client.socket.once('unsubscribed', function() {
				assert(!client.streams['stream1'])
					done()
			})
		})

		it('should throw error if no streamId given', function() {
			client.subscribe("stream1", function(message) {})
			client.connect()

			client.socket.once('subscribed', function() {
				assert.throws(function() {
					client.unsubscribe()
				})
			})
		})

		it('should handle messages after resubscribing', function(done) {
			client.subscribe("stream1", function(message) {})
			client.connect()
			
			client.socket.once('subscribed', function() {
				client.unsubscribe('stream1')
			})
			
			client.socket.once('unsubscribed', function() {
				assert(!client.streams['stream1'])
				client.subscribe("stream1", function(message) {
					done()
				})
				client.socket.once('subscribed', function() {
					client.socket.emit('ui', msg("stream1", 0, {}))
				})
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

		it('should disconnect when no longer subscribed to any streams', function(done) {
			client.options.autoDisconnect = true

			var sub1 = client.subscribe("stream1", function(message) {})
			var sub2 = client.subscribe("stream2", function(message) {})
			client.connect()

			client.socket.on('subscribed', function(response) {
				if (sub1.isSubscribed() && sub2.isSubscribed()) {
					client.unsubscribe('stream1')
					client.unsubscribe('stream2')
				}
			})

			client.socket.on('disconnect', function() {
				assert(!sub1.isSubscribed())
				assert(!sub2.isSubscribed())
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
					client.unsubscribe('stream1')
					client.unsubscribe('stream2')
					done()
				}
			})

			client.socket.on('disconnect', function() {
				throw "Should not have disconnected!"
			})
		})

		it('should reset subscriptions when calling disconnect()', function(done) {
			client.subscribe("stream1", function(message) {})
			client.connect()

			client.socket.once('subscribed', function() {
				client.disconnect()
			})

			client.socket.once('disconnect', function() {
				assert.equal(Object.keys(client.streams).length, 0)
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
				assert.equal(Object.keys(client.streams).length, 1)
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

				assert.equal(Object.keys(client.streams).length, 2)

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
			assert.deepEqual(el,request)
			validResendRequests.shift()
		}
		
		// Setup a resend response mock
		beforeEach(function() {
			validResendRequests = []
			resendLimits = {}

			function resend(channel, from, to) {
				client.socket.emit('resending', {
					channel: channel, 
					from: from, 
					to: to
				})
				for (var i=from;i<=to;i++) {
					client.socket.emit('ui', msg(channel,i))
				}
				client.socket.emit('resent', {channel: channel, from:from, to:to})
			}

			socket.defaultResendHandler = function(request) {
				console.log("defaultResendHandler: "+JSON.stringify(request))

				// Check that the request is allowed
				checkResendRequest(request)

				async(function() {
					if (request.resend_from!=null && request.resend_to!=null)
						resend(request.channel, request.resend_from, request.resend_to)
					else if (resendLimits[request.channel]===undefined)
						client.socket.emit('no_resend', {channel: request.channel, next: 0})
					else
						resend(request.channel, resendLimits[request.channel].from, resendLimits[request.channel].to)
				})
			}
			socket.on('resend', socket.defaultResendHandler)
		})

		afterEach(function() {
			if (validResendRequests.length>0) {
				throw "resend requests remaining: "+JSON.stringify(validResendRequests)
			}
		})
		
		it('should emit a resend request if the first message is not the expected one', function(done) {
			client.subscribe("stream1", function(message) {})
			client.connect()
			
			validResendRequests.push({channel:"stream1", resend_from:0, resend_to:1})

			client.socket.once('subscribed', function() {
				assert(client.socket.defaultResendHandler!=null)
				client.socket.emit('ui', msg("stream1",2))
			})

			client.socket.once('resent', function() {
				done()
			})			
		})
		
		it('should emit a resend request if there is a gap in messages', function(done) {
			client.subscribe("stream1", function(message) {})
			client.connect()
			
			validResendRequests.push({channel:"stream1", resend_from:1, resend_to:9})

			client.socket.once('subscribed', function() {
				client.socket.emit('ui', msg("stream1",0))
				client.socket.emit('ui', msg("stream1",10))
			})

			client.socket.once('resent', function() {
				done()
			})
		})
		
		it('should not emit another resend request while waiting for resend', function(done) {
			client.subscribe("stream1", function(message) {})
			client.connect()
			
			validResendRequests.push({channel:"stream1", resend_from:1, resend_to:9})

			client.socket.once('subscribed', function() {
				client.socket.emit('ui', msg("stream1",0))
				client.socket.emit('ui', msg("stream1",10))
				client.socket.emit('ui', msg("stream1",11))
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
				client.socket.emit('ui', msg("stream1", 0, {counter: 0}))
				client.socket.emit('ui', msg("stream1",10, {counter: 10}))
				client.socket.emit('ui', msg("stream1",11, {counter: 11}))
				client.socket.emit('ui', msg("stream1",12, {counter: 12}))
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
				client.socket.emit('ui', msg("stream1", 0, {counter: 0}))
				client.socket.emit('ui', msg("stream1", 10, {counter: 10}))
				client.socket.emit('ui', msg("stream1", 11, {counter: 11}))
				client.socket.emit('ui', msg("stream1", 11, {counter: 11})) // bogus message
				client.socket.emit('ui', msg("stream1", 5, {counter: 5})) // bogus message
				client.socket.emit('ui', msg("stream1", 12, {counter: 12}))
			})
		})
		
		it('should do another resend request if there are gaps in the queue', function(done) {
			var subscription = client.subscribe("stream1", function(message) {
				if (message.counter===12)
					done()
			})
			client.connect()
	
			validResendRequests.push({channel:"stream1", resend_from:1, resend_to:9})
			validResendRequests.push({channel:"stream1", resend_from:11, resend_to:11})
			
			client.socket.once('subscribed', function() {
				client.socket.emit('ui', msg("stream1", 0, {counter: 0}))
				client.socket.emit('ui', msg("stream1", 10, {counter: 10}))
				client.socket.emit('ui', msg("stream1", 12, {counter: 12}))
			})
		})
		
		it('should re-request from the latest counter on reconnect', function(done) {
			var sub1 = client.subscribe("stream1", function(message) {}, {resend_all:true})
			var sub2 = client.subscribe("stream2", function(message) {}, {resend_from:0})
			var sub3 = client.subscribe("stream3", function(message) {}) // no resend for stream3
			client.connect()

			validResendRequests.push({channel:"stream1", resend_all:true})
			validResendRequests.push({channel:"stream2", resend_from:0})

			client.socket.on('subscribed', function(response) {
				if (response.channel==='stream1') {
					client.socket.emit('ui', msg("stream1",0))
					client.socket.emit('ui', msg("stream1",1))
					client.socket.emit('ui', msg("stream1",2))
				}
				else if (response.channel==='stream2') {
					client.socket.emit('ui', msg("stream2",0))
				}
				else if (response.channel==='stream3') {
					client.socket.emit('ui', msg("stream3",0))
				}
				client.socket.emit('disconnect')
			})

			client.socket.once('disconnect', function() {
				client.connect()

				client.socket.on('subscribe', function(request) {
					if (request.channel==='stream1' && request.from !== 3)
						throw "Wrong starting index for "+request.channel+": "+request.from
					else if (request.channel==='stream2' && request.from !== 1)
						throw "Wrong starting index for "+request.channel+": "+request.from
					else if (request.channel==='stream3' && request.from !== undefined)
						throw "Should not have specified the from field for stream3: "+request.from
				})

				client.socket.on('subscribed', function(response) {
					if (sub1.isSubscribed() && sub2.isSubscribed() && sub3.isSubscribed())
						done()
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
			sub1.bind('subscribed', check)
			sub2.bind('subscribed', check)

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
			sub1.bind('unsubscribed', check)
			sub2.bind('unsubscribed', check)

			client.connect()

			client.socket.on('subscribed', function() {
				if (sub1.isSubscribed() && sub2.isSubscribed()) {
					client.unsubscribe('stream1')
					client.unsubscribe('stream2')
				}
			})
		})
	})

	describe("client events", function() {
		it('should trigger a connected event on connect', function(done) {
			client.bind('connected', function() {
				done()
			})
			client.connect()
		})

		it('should trigger a disconnected event on disconnect', function(done) {
			client.bind('disconnected', function() {
				done()
			})
			client.connect()
			client.socket.once('connect', function() {
				client.disconnect()
			})
		})

		it('should trigger a subscribed event on subscribed', function(done) {
			var subscribeCount = 0
			client.bind('subscribed', function(response) {
				if (++subscribeCount === 2)
					done()
			})
			client.subscribe("stream1", function(message) {})
			client.subscribe("stream2", function(message) {})
			client.connect()
		})

		it('should trigger an unsubscribed event on unsubscribed', function(done) {
			var count = 0
			client.bind('unsubscribed', function(response) {
				if (++count===2)
					done()
			})
			var sub1 = client.subscribe("stream1", function(message) {})
			var sub2 = client.subscribe("stream2", function(message) {})
			client.connect()

			client.socket.on('subscribed', function() {
				if (sub1.isSubscribed() && sub2.isSubscribed()) {
					client.unsubscribe('stream1')
					client.unsubscribe('stream2')
				}
			})
		})
	})
})

