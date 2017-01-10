var assert = require('assert'),
	events = require('events'),
	sinon = require('sinon'),
	constants = require('../lib/constants'),
	SocketIoServer = require('../lib/socketio-server')

describe('socketio-server', function () {

	var server
	var ioMock
	var realtimeAdapter
	var historicalAdapter
	var socket

	function createSocketMock(id) {
		var socket = new events.EventEmitter()
		socket.id = id

		socket.rooms = []
		socket.join = function(channel, cb) {
			socket.rooms.push(channel)
			console.log("SOCKET MOCK: Socket "+socket.id+" joined channel "+channel+", now on: "+socket.rooms)
			if (!ioMock.sockets.adapter.rooms[channel]) {
				ioMock.sockets.adapter.rooms[channel] = {}
				ioMock.sockets.adapter.rooms[channel][socket.id] = socket
			}
			cb()
		}
		socket.leave = function(channel, cb) {
			var index = socket.rooms.indexOf(channel)
			if (index>=0) {
				socket.rooms.splice(index, 1)
			}
			
			delete ioMock.sockets.adapter.rooms[channel][socket.id]	
			console.log("SOCKET MOCK: Socket "+socket.id+" left channel "+channel+", now on: "+socket.rooms)
			cb()
		}
		return socket
	}

	function msg(data, counter) {
		data[constants.COUNTER_KEY] = counter
		return data
	}

	beforeEach(function() {
		realtimeAdapter = new events.EventEmitter
		realtimeAdapter.subscribe = sinon.stub()
		realtimeAdapter.subscribe.callsArgAsync(2)
		realtimeAdapter.unsubscribe = sinon.stub()

		historicalAdapter = {
			getLast: sinon.stub(),
			getAll: sinon.stub(),
			getFromOffset: sinon.stub(),
			getOffsetRange: sinon.stub(),
			getFromTimestamp: sinon.stub(),
			getTimestampRange: sinon.stub()
		}

		// Mock socket.io
		ioMock = new events.EventEmitter

		ioMock.sockets = {
			adapter: {
				rooms: {}
			},
			in: function(room) {
				var sockets = Object.keys(ioMock.sockets.adapter.rooms[room]).map(function(key) {
					return ioMock.sockets.adapter.rooms[room][key]
				})
				var result = {
					emit: function(event, data) {
						sockets.forEach(function(socket) {
							console.log("IO MOCK: Emitting to "+socket.id+": "+JSON.stringify(data))
							socket.emit(event, data)
						})
					}
				}
				console.log("IO MOCK: in: returning emitter for "+JSON.stringify(sockets))
				return result
			}
		}

		// Mock the socket
		socket = createSocketMock("socket1")

		// Create the server instance
		server = new SocketIoServer(undefined, realtimeAdapter, historicalAdapter, ioMock)
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

		beforeEach(function() {
			// io.sockets.in(channel).emit('ui', data);
			ioMock.sockets = {
				in: function(channel) {
					return socket
				}
			}
		})

		afterEach(function() {
			socket.removeAllListeners("expect")
		})

		it('should emit a resending event before starting the resend', function(done) {
			historicalAdapter.getAll.callsArgAsync(2);

			socket.on('resending', function(data) {
				assert.equal(data.channel, "c")
				assert.equal(data.sub, "sub")
				done()
			})

			ioMock.emit('connection', socket)
			socket.emit('resend', {channel:"c", sub: "sub", resend_all:true})
		})

		it('should add the subscription id to messages', function(done) {
			var originalMsg = {}
			historicalAdapter.getAll.callsArgWithAsync(2, originalMsg);

			socket.on('u', function(msg) {
				assert.equal(msg.m, originalMsg)
				assert.equal(msg.sub, 'foo')
				done()
			})

			ioMock.emit('connection', socket)
			socket.emit('resend', {channel:"c", sub: 'foo', resend_all:true})
		})

		it('should emit a resent event when resend is complete', function(done) {
			historicalAdapter.getAll = function(streamId, streamPartition, handler, finished) {
				handler([])
				finished()
			}

			socket.on('resent', function(data) {
				assert.equal(data.channel, "c")
				assert.equal(data.sub, "sub")
				done()
			})

			ioMock.emit('connection', socket)
			socket.emit('resend', {channel:"c", sub: "sub", resend_all:true})
		})

		it('should emit no_resend if there is nothing to resend', function(done) {
			historicalAdapter.getAll.callsArgAsync(3);

			socket.on('no_resend', function(data) {
				assert.equal(data.channel, "c")
				assert.equal(data.sub, "sub")
				done()
			})

			ioMock.emit('connection', socket)
			socket.emit('resend', {channel:"c", sub: "sub", resend_all:true})
		})

		describe('resend_all', function() {

			it('should request all messages', function () {
				ioMock.emit('connection', socket)
				socket.emit('resend', {channel: "c", resend_all: true})
				historicalAdapter.getAll.calledWith("c")
			});

		})

		describe('resend_from', function() {

			it('should request messages from given offset of only resend_from is given', function () {
				ioMock.emit('connection', socket)
				socket.emit('resend', {channel: "c", resend_from: 7})
				historicalAdapter.getFromOffset.calledWith("c", 7)
			});

			it('should request range if resend_from and resend_to are given', function () {
				ioMock.emit('connection', socket)
				socket.emit('resend', {channel: "c", resend_from: 7, resend_to: 10})
				historicalAdapter.getOffsetRange.calledWith("c", 7, 10)
			});

		})

		describe('resend_from_time', function() {

			it('should request messages from given timestamp', function () {
				var timestamp = Date.now()
				ioMock.emit('connection', socket)
				socket.emit('resend', {channel: "c", resend_from_time: timestamp})
				historicalAdapter.getFromOffset.calledWith("c", timestamp)
			});

		})

		describe('resend_last', function() {

			it('should request last N messages', function () {
				ioMock.emit('connection', socket)
				socket.emit('resend', {channel: "c", resend_last: 10})
				historicalAdapter.getLast.calledWith("c", 10)
			});

		})
	})

	describe('message broadcasting', function() {

		it('should emit redis messages to sockets in that channel', function (done) {
			var originalMsg = {}

			// Expecting io.sockets.in(stream-partition).emit('b', msg);
			ioMock.sockets.in = function(channel) {
				assert.equal(channel, "c-0")
				return {
					emit: function(event, msg) {
						assert.equal(event, 'b')
						assert.deepEqual(msg, originalMsg)
						done()
					}
				}
			}
			ioMock.emit('connection', socket)
			socket.emit('subscribe', {channel: "c"})
			realtimeAdapter.emit('message', originalMsg, "c", 0)
		});

	})

	describe('subscribe', function() {

		it('should create the Stream object with default partition', function() {
			ioMock.emit('connection', socket)
			socket.emit('subscribe', {channel: "c"})
			assert(server.getStreamObject("c", 0) !== undefined)
		})

		it('should create the Stream object with given partition', function() {
			ioMock.emit('connection', socket)
			socket.emit('subscribe', {channel: "c", partition: 1})
			assert(server.getStreamObject("c", 1) !== undefined)
		})

		it('should subscribe the realtime adapter', function() {
			ioMock.emit('connection', socket)
			socket.emit('subscribe', {channel: "c"})

			assert(realtimeAdapter.subscribe.calledWith("c"))
		})

		it('should emit subscribed when subscribe callback is called', function (done) {
			socket.on('subscribed', function(data) {
				assert.equal(data.channel, "c")
				done()
			})

			ioMock.emit('connection', socket)
			socket.emit('subscribe', {channel: "c"})
		});

		it('should not resubscribe realtimeAdapter on new subscription to same stream', function () {
			var socket2 = createSocketMock("socket2")

			ioMock.emit('connection', socket)
			socket.emit('subscribe', {channel: "c"})

			ioMock.emit('connection', socket2)
			socket2.emit('subscribe', {channel: "c"})

			assert(realtimeAdapter.subscribe.calledOnce)
		});

		it('should join the room', function(done) {
			socket.on('subscribed', function(data) {
				assert.equal(Object.keys(ioMock.sockets.adapter.rooms['c-0']).length, 1)
				done()
			})

			ioMock.emit('connection', socket)
			socket.emit('subscribe', {channel: "c"})
		})

	})

	describe('unsubscribe', function() {

		beforeEach(function(done) {
			socket.on('subscribed', function(data) {
				done()
			})

			ioMock.emit('connection', socket)
			socket.emit('subscribe', {channel: "c"})
		})

		it('should emit unsubscribed event', function(done) {
			socket.on('unsubscribed', function(data) {
				assert.equal(data.channel, 'c')
				done()
			})
			socket.emit('unsubscribe', {channel: 'c'})
		})

		it('should leave the room', function(done) {
			socket.on('unsubscribed', function(data) {
				assert.equal(socket.rooms.length, 0)
				done()
			})
			socket.emit('unsubscribe', {channel: 'c'})
		})

		it('should unsubscribe realtimeAdapter if there are no more sockets on the channel', function(done) {
			socket.on('unsubscribed', function(channel) {
				assert(realtimeAdapter.unsubscribe.calledWith("c"))
				done()
			})
			socket.emit('unsubscribe', {channel: 'c'})
		})

		it('should NOT unsubscribe kafka if there are sockets remaining on the channel', function() {
			var socket2 = createSocketMock("socket2")

			socket2.on('subscribed', function(channel) {
				socket2.emit('unsubscribe', {channel: 'c'})
			})

			realtimeAdapter.unsubscribe.throws("Should not have unsubscribed!")

			ioMock.emit('connection', socket2)
			socket2.emit('subscribe', {channel: "c"})
		})
	})

	describe('subscribe-unsubscribe-subscribe', function() {
		it('should work', function(done) {
			socket.once('subscribed', function(data) {
				socket.emit('unsubscribe', {channel: 'c'})
			})

			socket.once('unsubscribed', function() {
				socket.once('subscribed', function() {
					done()
				})
				socket.emit('subscribe', {channel: "c"})
			})

			ioMock.emit('connection', socket)
			socket.emit('subscribe', {channel: "c"})
		})
	})

	describe('disconnect', function() {
		it('should unsubscribe realtimeAdapter on channels where there are no more connections', function(done) {
			socket.on('subscribed', function(channel) {
				// socket.io clears socket.rooms on disconnect, check that it's not relied on
				socket.rooms = []
				socket.emit('disconnect')
			})

			realtimeAdapter.unsubscribe = function() {
				done()
			}

			ioMock.emit('connection', socket)
			socket.emit('subscribe', {channel: "c"})
		})

	})

	describe('createStreamObject', function() {
		it('should return an object with the correct id, partition and state', function() {
			var stream = server.createStreamObject('streamId', 0)
			assert.equal(stream.id, 'streamId')
			assert.equal(stream.partition, 0)
			assert.equal(stream.state, 'init')
		})

		it('should return an object that can be looked up', function() {
			var stream = server.createStreamObject('streamId', 0)
			assert.equal(server.getStreamObject('streamId', 0), stream)
		})

	})

	describe('getStreamObject', function() {
		var stream
		beforeEach(function() {
			stream = server.createStreamObject('streamId', 0)
		})

		it('must return the requested stream', function() {
			assert.equal(server.getStreamObject('streamId', 0), stream)
		})

		it('must return undefined if the stream does not exist', function() {
			assert.equal(server.getStreamObject('streamId', 1), undefined)
		})
	})

	describe('deleteStreamObject', function() {
		var stream
		beforeEach(function() {
			stream = server.createStreamObject('streamId', 0)
		})

		it('must delete the requested stream', function() {
			server.deleteStreamObject('streamId', 0)
			assert.equal(server.getStreamObject('streamId', 0), undefined)
		})
	})


});