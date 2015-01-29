var assert = require('assert'),
	events = require('events'),
	SocketIoServer = require('../lib/socketio-server').SocketIoServer

describe('socketio-server', function () {

	var server
	var kafkaMock
	var ioMock
	var socket

	beforeEach(function() {
		kafkaMock = new events.EventEmitter
		ioMock = new events.EventEmitter
		server = new SocketIoServer('invalid-zookeeper-addr', 0, kafkaMock, ioMock)

		socket = new events.EventEmitter()
		socket.id = "id"
	});

	afterEach(function() {
	
	});

	it('should listen for protocol events on client socket', function (done) {
		var protocolMessages = ["subscribe", "unsubscribe", "resend", "disconnect"]
		var socketListeners = {}
		socket.on = function(event, func) {
			socketListeners[event] = func
			if (Object.keys(socketListeners).length === protocolMessages.length) {
				// Check the subscribed events
				protocolMessages.forEach(function(event) {
					assert.equal(typeof socketListeners[event], 'function')
				})
				done()
			}
		}
		ioMock.emit('connection', socket)
	});

	describe('resend', function() {

		var expect
		var uiCounter

		beforeEach(function() {
			kafkaMock.getOffset = function(channel, earliest, cb) {
				assert.equal(channel, "c")
				cb(earliest ? 5 : 10)
			}

			expect = null
			socket.on("expect", function(data) {
				assert.equal(data.channel, "c")
				expect = data.from
			})

			// io.sockets.in(channel).emit('ui', data);
			ioMock.sockets = {
				in: function(channel) {
					return socket
				}
			}

			msgCounter = 0
			socket.on('ui', function(data) {
				msgCounter++
			})
		})

		afterEach(function() {
			socket.removeAllListeners("expect")
		})

		describe('resend_all', function() {

			it('should query the offsets and request a resend of all messages', function (done) {
				kafkaMock.resend = function(channel, from, to, handler, callback) {
					assert.equal(channel, "c")
					assert.equal(from, 5)
					assert.equal(to, 9)
					assert.equal(expect, 5)

					for (var i=from;i<=to;i++)
						handler({foo:"bar"})
					callback()

					assert.equal(msgCounter, to-from+1)
					done()
				}

				ioMock.emit('connection', socket)
				socket.emit('resend', {channel:"c", resend_all:true})
			});
		})

		describe('resend_from', function() {

			it('should query the offsets and request resend from given offset', function (done) {
				kafkaMock.resend = function(channel, from, to, handler, callback) {
					assert.equal(channel, "c")
					assert.equal(from, 7)
					assert.equal(to, 9)
					assert.equal(expect, 7)

					for (var i=from;i<=to;i++)
						handler({foo:"bar"})
					callback()

					assert.equal(msgCounter, to-from+1)
					done()
				}

				ioMock.emit('connection', socket)
				socket.emit('resend', {channel:"c", resend_from:7})
			});

			it('should not resend from below-range offset', function (done) {
				kafkaMock.resend = function(channel, from, to, handler, callback) {
					assert.equal(channel, "c")
					assert.equal(from, 5)
					assert.equal(to, 9)
					assert.equal(expect, 5)

					for (var i=from;i<=to;i++)
						handler({foo:"bar"})
					callback()

					assert.equal(msgCounter, to-from+1)
					done()
				}

				ioMock.emit('connection', socket)
				socket.emit('resend', {channel:"c", resend_from:2})
			});

			it('should not resend from above-range offset', function (done) {
				kafkaMock.resend = function(channel, from, to, handler, callback) {
					throw "Resend should not be called, but it was! From: "+from+", to: "+to
				}

				ioMock.emit('connection', socket)
				socket.emit('resend', {channel:"c", resend_from:15})
				assert.equal(expect, 10)
				done()
			});

		})

		describe('resend_last', function() {
			it('should query the offsets and request resend for the last N messages', function (done) {
				kafkaMock.resend = function(channel, from, to, handler, callback) {
					assert.equal(channel, "c")
					assert.equal(from, 8)
					assert.equal(to, 9)
					assert.equal(expect, 8)

					for (var i=from;i<=to;i++)
						handler({foo:"bar"})
					callback()

					assert.equal(msgCounter, to-from+1)
					done()
				}

				ioMock.emit('connection', socket)
				socket.emit('resend', {channel:"c", resend_last:2})
			});

			it('should not try to resend more than what is available', function (done) {
				kafkaMock.resend = function(channel, from, to, handler, callback) {
					assert.equal(channel, "c")
					assert.equal(from, 5)
					assert.equal(to, 9)
					assert.equal(expect, 5)

					for (var i=from;i<=to;i++)
						handler({foo:"bar"})
					callback()

					assert.equal(msgCounter, to-from+1)
					done()
				}

				ioMock.emit('connection', socket)
				socket.emit('resend', {channel:"c", resend_last:100})
			});

			it('should not resend if resend_last is zero', function (done) {
				kafkaMock.resend = function(channel, from, to, handler, callback) {
					throw "Resend should not be called, but it was! From: "+from+", to: "+to
				}

				ioMock.emit('connection', socket)
				socket.emit('resend', {channel:"c", resend_last:0})
				assert.equal(expect, 10)
				done()
			});

			it('should not resend if resend_last is negative', function (done) {
				kafkaMock.resend = function(channel, from, to, handler, callback) {
					throw "Resend should not be called, but it was! From: "+from+", to: "+to
				}

				ioMock.emit('connection', socket)
				socket.emit('resend', {channel:"c", resend_last:-100})
				assert.equal(expect, 10)
				done()
			});
		})
	})

	it('should emit kafka messages to sockets in that channel', function (done) {
		// Expecting io.sockets.in(channel).emit('ui', data); 
		ioMock.sockets = {
			in: function(channel) {
				assert.equal(channel, "c")
				return {
					emit: function(event, data) {
						assert.equal(event, 'ui')
						assert.equal(data.foo, "bar")
						done()
					}
				}
			}
		}
		ioMock.emit('connection', socket)
		kafkaMock.emit('message', {foo:"bar"}, "c")
	});

	describe('subscribe', function() {
		beforeEach(function() {
			socket.rooms = []
			socket.join = function(channel, cb) {
				socket.rooms.push(channel)
				cb()
			}
		})

		it('should subscribe to requested channels', function (done) {
			// Must get the subscribed event
			var subscribed = false
			socket.on('subscribed', function(data) {
				subscribed = true
				assert.equal(data.channels.length, 2)
				assert.equal(data.channels[0], "c")
				assert.equal(data.channels[1], "b")
				if (subscribed && kafkaSubscribeCount===2)
					done()
			})

			var kafkaSubscribeCount = 0
			kafkaMock.subscribe = function(channel) {
				kafkaSubscribeCount++
				if (subscribed && kafkaSubscribeCount===2)
					done()
			}

			ioMock.emit('connection', socket)
			socket.emit('subscribe', [{channel: "c"},{channel:"b"}])
		});

		it('should handle rerequests', function (done) {
			kafkaMock.subscribe = function() {}
			kafkaMock.getOffset = function(channel, earliest, cb) {
				if (channel==="b")
					cb(earliest ? 5 : 10)
				else if (channel==="c")
					cb(earliest ? 0 : 3)
				else throw "Wrong channel: "+channel
			}
			var resendCount = 0
			kafkaMock.resend = function(channel, from, to, handler, callback) {
				resendCount++

				if (channel==="b") {
					assert.equal(from, 5)
					assert.equal(to, 9)
				}
				else if (channel==="c") {
					assert.equal(from, 0)
					assert.equal(to, 2)
				}
				else throw "Wrong channel: "+channel

				if (resendCount===2)
					done()
			}

			ioMock.emit('connection', socket)
			socket.emit('subscribe', [
				{channel: "c", options: {resend_all: true}},
				{channel:"b", options: {resend_last: 5}}
			])
		});
	})

	// TODO: test unsubscribe, check that leaves channel and check if kafka sub is not needed anymore
	// TODO: test disconnect, check if kafka subs are not needed anymore

});