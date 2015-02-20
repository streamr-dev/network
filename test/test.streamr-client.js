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
	
	it('should emit a subscribe event on connect', function(done) {
		var subscription = client.subscribe("stream1", function(message) {})
		client.connect()

		client.socket.emit = function(e, subscriptions) {
			if (e==='subscribe' && subscriptions.length===1 && subscriptions[0].channel==='stream1')
				done()
		}
		client.socket.trigger('connect')
	})

	it('should emit a subscribe event on reconnect', function(done) {
		var subscription = client.subscribe("stream1", function(message) {})
		client.connect()

		client.socket.emit = function(e, subscriptions) {
			if (e==='subscribe' && subscriptions.length===1 && subscriptions[0].channel==='stream1')
				done()
		}

		client.socket.trigger('disconnect')
		client.socket.trigger('connect')
	})

	it('should not emit a subscribe event on connect if not subscribed to anything', function(done) {
		client.connect()

		client.socket.emit = function(e, subscriptions) {
			throw "Unexpected emit!"
		}
		client.socket.trigger('connect')
		done()
	})

	it('should not a subscribe event for unsubscribed streams', function(done) {
		var subscription = client.subscribe("stream1", function(message) {})
		var subscription = client.subscribe("stream2", function(message) {})
		client.connect()

		client.socket.trigger('connect')
		client.socket.trigger('subscribed', {channels: ["stream1","stream2"]})

		client.socket.trigger('ui', byeMsg("stream1", 0))
		client.socket.trigger('unsubscribed', {channel:"stream1"})

		client.socket.emit = function(e, subscriptions) {
			if (subscriptions.length>1 || subscriptions[0]==="stream1")
			throw "Should not have subscribed to stream1 on reconnect!"
		}
		client.socket.trigger('disconnect')
		client.socket.trigger('connect')
		done()
	})
	
	it('should emit a subscribe event when subscribing after connecting', function(done) {
		client.connect()
		client.socket.trigger('connect')

		client.socket.emit = function(e, subscriptions) {
			if (e==='subscribe' && subscriptions.length===1 && subscriptions[0].channel==='stream1')
				done()
		}
		client.subscribe("stream1", function(message) {})
	})

	it('should emit a subscribe event on disconnect for topics subscribed after initial connect', function(done) {
		client.connect()
		client.socket.trigger('connect')

		client.subscribe("stream1", function(message) {})

		client.socket.emit = function(e, subscriptions) {
			if (e==='subscribe' && subscriptions.length===1 && subscriptions[0].channel==='stream1')
				done()
		}
		client.socket.trigger('disconnect')
		client.socket.trigger('connect')
	})

	it('should include options in the subscription message', function(done) {
		var subscription = client.subscribe("stream1", function(message) {}, {resend:true})
		client.connect()

		client.socket.emit = function(e, subscriptions) {
			if (e==='subscribe' && subscription.options.resend)
				done()
		}
		client.socket.trigger('connect')
	})

	it('should mark channels as subscribed when the server responds with subscribed', function(done) {
		var subscription = client.subscribe("stream1", function(message) {})
		client.connect()
		client.socket.trigger('connect')
		client.socket.trigger('subscribed', {channels: ["stream1"]})
		assert(subscription.subscribed)
		done()
	})

	it('should call the callback when a message is received with correct counter', function(done) {
		var subscription = client.subscribe("stream1", function(message) {
			done()
		})
		client.connect()
		client.socket.trigger('connect')
		
		// Fake message
		client.socket.trigger('ui', msg("stream1", 0))
	})

	it('should emit unsubscribe after processing a message with the bye key', function(done) {
		var processed = false
		var subscription = client.subscribe("stream1", function(message) {
			processed = true
		})
		client.connect()
		client.socket.trigger('connect')
		
		client.socket.emit = function(event, options) {
			if (event==='unsubscribe' && processed && options.channels.length===1 && options.channels[0]==='stream1')
				done()
			else throw "Unexpected emission: "+event
		}

		// Fake message
		client.socket.trigger('ui', byeMsg("stream1", 0))
	})

	it('should remove streams on unsubscribed', function(done) {
		var subscription = client.subscribe("stream1", function(message) {})
		client.connect()
		client.socket.trigger('connect')
		
		// Fake message
		client.socket.trigger('ui', byeMsg("stream1", 0))
		client.socket.trigger('unsubscribed', {channel: 'stream1'})
		assert(!client.streams['stream1'])
		done()
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
		
		client.socket.trigger('ui', msg("stream1", 0, {count:0}))
		client.socket.trigger('ui', msg("stream1", 1, {count:1}))
		client.socket.trigger('ui', msg("stream1", 2, {count:2}))
	})
	
	it('should disconnect the socket when disconnected', function(done) {
		var subscription = client.subscribe("stream1", function(message) {})
		client.connect()
		client.socket.trigger('connect')

		client.socket.disconnect = done
		client.disconnect()
	})
	
	it('should report that its connected after connecting', function(done) {
		client.subscribe("stream1", function(message) {})
		client.connect()
		client.socket.trigger('connect')

		assert(client.isConnected())
		done()
	})

	it('should report that its not connected after disconnecting', function(done) {
		client.subscribe("stream1", function(message) {})
		client.connect()
		client.socket.trigger('connect')

		client.disconnect()
		client.socket.trigger('disconnect')
		assert(!client.isConnected())
		done()
	})
	
	it('should only subscribe to new subscriptions since calling disconnect()', function(done) {
		client.subscribe("stream1", function(message) {})
		var streams = client.connect()
		client.socket.trigger('connect')

		client.disconnect()
		client.socket.trigger('disconnect')
		
		client.subscribe("stream2", function(message) {})
		streams = client.connect()

		socket.emit = function(e, subscriptions) {
			if (e==='subscribe' && subscriptions.length===1)
				done()
		}
		socket.trigger('connect')
	})
	
	describe("resend", function() {
		var validResendRequests
		var resendRequestCount
		
		function checkResendRequest(options, idx) {
			var el = validResendRequests[idx]

			if (el.channel===options.channel && el.from===options.from && el.to===options.to)
				return true
			else throw "Illegal resend request: "+JSON.stringify(options)
		}

		function resendCheckingEmitter(event, options) {
			if (event==="resend") {
				// Check that the request is allowed
				checkResendRequest(options, resendRequestCount++)
				
				setTimeout(function() {
					for (var i=options.from;i<=options.to;i++) {
						client.socket.trigger('ui', msg(options.channel,i))
					}
					client.socket.trigger('resent', {channel: options.channel, from:options.from, to:options.to})
				}, 0)
			}
		}
		
		// Setup a resend response mock
		beforeEach(function() {
			validResendRequests = []
			resendRequestCount = 0
		})
		
		it('should emit a resend request if the first message has a non-zero counter', function(done) {
			var subscription = client.subscribe("stream1", function(message) {})
			client.connect()
			client.socket.trigger('connect')
			
			validResendRequests.push({channel:"stream1", from:0, to:1})
			client.socket.emit = function(event, options) {
				checkResendRequest(options,0)
				done()
			}
			
			client.socket.trigger('ui', msg("stream1",2))
		})
		
		it('should emit a resend request if there is a gap in messages', function(done) {
			var subscription = client.subscribe("stream1", function(message) {})
			client.connect()
			client.socket.trigger('connect')
			
			validResendRequests.push({channel:"stream1", from:1, to:9})
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
	
			validResendRequests.push({channel:"stream1", from:1, to:9})
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
	
			validResendRequests.push({channel:"stream1", from:1, to:9})
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
	
			validResendRequests.push({channel:"stream1", from:1, to:9})
			validResendRequests.push({channel:"stream1", from:11, to:11})
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
			
			client.socket.trigger('ui', msg("stream1",0))
			client.socket.trigger('ui', msg("stream1",1))
			client.socket.trigger('ui', msg("stream1",2))
			
			client.socket.trigger('ui', msg("stream2",0))
			client.socket.trigger('ui', msg("stream3",0))
				
			client.socket.emit = function(event, data) {				
				if (event==="subscribe"
					&& !data[0].options.resend_all
					&& data[0].options.resend_from===3
					&& !data[1].options.resend_all
					&& data[1].options.resend_from===1
					&& !data[2].options.resend_from) {
					done()
				}
			}
			
			client.socket.trigger('disconnect')
			client.socket.trigger('connect')
		})

		it('should set the expected counter to what the expect message says', function(done) {
			var sub = client.subscribe("stream1", function(message) {}, {resend_all:true})
			client.connect()
			client.socket.trigger('connect')
			client.socket.trigger('expect', {channel: "stream1", from: 10})
			assert.equal(sub.counter, 10)
			done()
		})
	})	
})

