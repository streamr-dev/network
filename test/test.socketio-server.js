const assert = require('assert')
const events = require('events')
const sinon = require('sinon')
const mockery = require('mockery')
const constants = require('../lib/constants')
var SocketIoServer

describe('socketio-server', function () {

	var server
	var wsMock
	var realtimeAdapter
	var historicalAdapter
	var latestOffsetFetcher
	var mockSocket

	function createSocketMock() {
		var socket = new events.EventEmitter()

		socket.rooms = []
		socket.join = function(channel, cb) {
			socket.rooms.push(channel)
			console.log("SOCKET MOCK: Socket "+socket.id+" joined channel "+channel+", now on: "+socket.rooms)
			if (!wsMock.sockets.adapter.rooms[channel]) {
				wsMock.sockets.adapter.rooms[channel] = {}
				wsMock.sockets.adapter.rooms[channel][socket.id] = socket
			}
			cb()
		}
		socket.leave = function(channel, cb) {
			var index = socket.rooms.indexOf(channel)
			if (index>=0) {
				socket.rooms.splice(index, 1)
			}
			
			delete wsMock.sockets.adapter.rooms[channel][socket.id]
			console.log("SOCKET MOCK: Socket "+socket.id+" left channel "+channel+", now on: "+socket.rooms)
			cb()
		}
		return socket
	}

	before(function() {
		mockery.enable()
		mockery.registerMock('node-uuid', {
			idx: 1,
			v4: function() {
				return "socket" + (this.idx++)
			}
		})
		SocketIoServer = require('../lib/socketio-server')
	})

	after(function() {
		mockery.disable()
	})

	beforeEach(function() {
		realtimeAdapter = new events.EventEmitter
		realtimeAdapter.subscribe = sinon.mock()
		realtimeAdapter.subscribe.callsArgAsync(2)
		realtimeAdapter.unsubscribe = sinon.mock()

		historicalAdapter = {
			getLast: sinon.mock(),
			getAll: sinon.mock(),
			getFromOffset: sinon.mock(),
			getOffsetRange: sinon.mock(),
			getFromTimestamp: sinon.mock(),
			getTimestampRange: sinon.mock()
		}

		latestOffsetFetcher = {
			fetchOffset: function() {
				return Promise.resolve(0)
			}
		}

		// Mock socket.io
		wsMock = new events.EventEmitter

		wsMock.sockets = {
			adapter: {
				rooms: {}
			},
			in: function(room) {
				var sockets = Object.keys(wsMock.sockets.adapter.rooms[room]).map(function(key) {
					return wsMock.sockets.adapter.rooms[room][key]
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
		mockSocket = createSocketMock("socket1")

		// Create the server instance
		server = new SocketIoServer(undefined, realtimeAdapter, historicalAdapter, latestOffsetFetcher, wsMock)
	});

	// TODO: replace
	/*it('should listen for protocol events on client socket', function (done) {
		const protocolMessages = ["subscribe", "unsubscribe", "resend", "disconnect"]
		const socketListeners = {}

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
	});*/

	context('on socket connection', function() {
		var mockSocket2

		beforeEach(function() {
			mockSocket2 = createSocketMock()
			wsMock.emit('connection', mockSocket)
			wsMock.emit('connection', mockSocket2)
		})

		it('assigns identifiers to connected sockets', function() {
			assert.equal(mockSocket.id, 'socket1')
			assert.equal(mockSocket2.id, 'socket2')
		})

		it('listens to connected sockets "message" event', function() {
			assert.equal(mockSocket.listenerCount('message'), 1)
			assert.equal(mockSocket2.listenerCount('message'), 1)
		})

		it('listens to connected sockets "close" event', function() {
			assert.equal(mockSocket.listenerCount('close'), 1)
			assert.equal(mockSocket2.listenerCount('close'), 1)
		})

		it('increments connection counter', function() {
			assert.equal(server.connectionCounter, 2)
		})
	})

	describe('resend', function() {

		beforeEach(function() {
			wsMock.sockets = {
				in: function(channel) {
					return mockSocket
				}
			}
		})

		afterEach(function() {
			mockSocket.removeAllListeners("expect")
		})

		it('emits a resending event before starting the resend', function(done) {
			historicalAdapter.getAll.callsArgAsync(2); // Async-invoke 2nd argument

			mockSocket.on('resending', function(data) {
				assert.equal(data.channel, "c")
				assert.equal(data.sub, "sub")
				done()
			})

			wsMock.emit('connection', mockSocket)
			mockSocket.emit('resend', {channel:"c", sub: "sub", resend_all:true})
		})

		it('should add the subscription id to messages', function(done) {
			var originalMsg = {}
			historicalAdapter.getAll.callsArgWithAsync(2, originalMsg);

			mockSocket.on('u', function(msg) {
				assert.equal(msg.m, originalMsg)
				assert.equal(msg.sub, 'foo')
				done()
			})

			wsMock.emit('connection', mockSocket)
			mockSocket.emit('resend', {channel:"c", sub: 'foo', resend_all:true})
		})

		it('should emit a resent event when resend is complete', function(done) {
			historicalAdapter.getAll = function(streamId, streamPartition, handler, finished) {
				handler([])
				finished()
			}

			mockSocket.on('resent', function(data) {
				assert.equal(data.channel, "c")
				assert.equal(data.sub, "sub")
				done()
			})

			wsMock.emit('connection', mockSocket)
			mockSocket.emit('resend', {channel:"c", sub: "sub", resend_all:true})
		})

		it('should emit no_resend if there is nothing to resend', function(done) {
			historicalAdapter.getAll.callsArgAsync(3);

			mockSocket.on('no_resend', function(data) {
				assert.equal(data.channel, "c")
				assert.equal(data.sub, "sub")
				done()
			})

			wsMock.emit('connection', mockSocket)
			mockSocket.emit('resend', {channel:"c", sub: "sub", resend_all:true})
		})

		describe('resend_all', function() {
			it('requests all messages', function () {
				wsMock.emit('connection', mockSocket)
				mockSocket.emit('resend', {channel: "c", resend_all: true})
				assert(historicalAdapter.getAll.calledWith("c"))
			})
		})

		describe('resend_from', function() {

			it('should request messages from given offset of only resend_from is given', function () {
				wsMock.emit('connection', mockSocket)
				mockSocket.emit('resend', {channel: "c", resend_from: 7})
				assert(historicalAdapter.getFromOffset.calledWith("c", 7))
			});

			it('should request range if resend_from and resend_to are given', function () {
				wsMock.emit('connection', mockSocket)
				mockSocket.emit('resend', {channel: "c", resend_from: 7, resend_to: 10})
				assert(historicalAdapter.getOffsetRange.calledWith("c", 7, 10))
			});

		})

		describe('resend_from_time', function() {

			it('should request messages from given timestamp', function () {
				var timestamp = Date.now()
				wsMock.emit('connection', mockSocket)
				mockSocket.emit('resend', {channel: "c", resend_from_time: timestamp})
				assert(historicalAdapter.getFromOffset.calledWith("c", timestamp))
			});

		})

		describe('resend_last', function() {

			it('should request last N messages', function () {
				wsMock.emit('connection', mockSocket)
				mockSocket.emit('resend', {channel: "c", resend_last: 10})
				assert(historicalAdapter.getLast.calledWith("c", 10))
			});

		})
	})

	describe('message broadcasting', function() {

		it('should emit redis messages to sockets in that channel', function (done) {
			var originalMsg = {}

			// Expecting io.sockets.in(stream-partition).emit('b', msg);
			wsMock.sockets.in = function(channel) {
				assert.equal(channel, "c-0")
				return {
					emit: function(event, msg) {
						assert.equal(event, 'b')
						assert.deepEqual(msg, originalMsg)
						done()
					}
				}
			}
			wsMock.emit('connection', mockSocket)
			mockSocket.emit('subscribe', {channel: "c"})
			realtimeAdapter.emit('message', originalMsg, "c", 0)
		});

	})

	describe('subscribe', function() {

		it('should create the Stream object with default partition', function() {
			wsMock.emit('connection', mockSocket)
			mockSocket.emit('subscribe', {channel: "c"})
			assert(server.getStreamObject("c", 0) !== undefined)
		})

		it('should create the Stream object with given partition', function() {
			wsMock.emit('connection', mockSocket)
			mockSocket.emit('subscribe', {channel: "c", partition: 1})
			assert(server.getStreamObject("c", 1) !== undefined)
		})

		it('should subscribe the realtime adapter', function() {
			wsMock.emit('connection', mockSocket)
			mockSocket.emit('subscribe', {channel: "c"})

			assert(realtimeAdapter.subscribe.calledWith("c"))
		})

		it('should emit subscribed when subscribe callback is called', function (done) {
			mockSocket.on('subscribed', function(data) {
				assert.equal(data.channel, "c")
				done()
			})

			wsMock.emit('connection', mockSocket)
			mockSocket.emit('subscribe', {channel: "c"})
		});

		it('should not resubscribe realtimeAdapter on new subscription to same stream', function () {
			var socket2 = createSocketMock("socket2")

			wsMock.emit('connection', mockSocket)
			mockSocket.emit('subscribe', {channel: "c"})

			wsMock.emit('connection', socket2)
			socket2.emit('subscribe', {channel: "c"})

			assert(realtimeAdapter.subscribe.calledOnce)
		});

		it('should join the room', function(done) {
			mockSocket.on('subscribed', function(data) {
				assert.equal(Object.keys(wsMock.sockets.adapter.rooms['c-0']).length, 1)
				done()
			})

			wsMock.emit('connection', mockSocket)
			mockSocket.emit('subscribe', {channel: "c"})
		})

	})

	describe('unsubscribe', function() {

		beforeEach(function(done) {
			mockSocket.on('subscribed', function(data) {
				done()
			})

			wsMock.emit('connection', mockSocket)
			mockSocket.emit('subscribe', {channel: "c"})
		})

		it('should emit unsubscribed event', function(done) {
			mockSocket.on('unsubscribed', function(data) {
				assert.equal(data.channel, 'c')
				done()
			})
			mockSocket.emit('unsubscribe', {channel: 'c'})
		})

		it('should leave the room', function(done) {
			mockSocket.on('unsubscribed', function(data) {
				assert.equal(mockSocket.rooms.length, 0)
				done()
			})
			mockSocket.emit('unsubscribe', {channel: 'c'})
		})

		it('should unsubscribe realtimeAdapter if there are no more sockets on the channel', function(done) {
			mockSocket.on('unsubscribed', function(channel) {
				assert(realtimeAdapter.unsubscribe.calledWith("c"))
				done()
			})
			mockSocket.emit('unsubscribe', {channel: 'c'})
		})

		it('should NOT unsubscribe kafka if there are sockets remaining on the channel', function() {
			var socket2 = createSocketMock("socket2")

			socket2.on('subscribed', function(channel) {
				socket2.emit('unsubscribe', {channel: 'c'})
			})

			realtimeAdapter.unsubscribe.throws("Should not have unsubscribed!")

			wsMock.emit('connection', socket2)
			socket2.emit('subscribe', {channel: "c"})
		})
	})

	describe('subscribe-unsubscribe-subscribe', function() {
		it('should work', function(done) {
			mockSocket.once('subscribed', function(data) {
				mockSocket.emit('unsubscribe', {channel: 'c'})
			})

			mockSocket.once('unsubscribed', function() {
				mockSocket.once('subscribed', function() {
					done()
				})
				mockSocket.emit('subscribe', {channel: "c"})
			})

			wsMock.emit('connection', mockSocket)
			mockSocket.emit('subscribe', {channel: "c"})
		})
	})

	describe('disconnect', function() {
		it('should unsubscribe realtimeAdapter on channels where there are no more connections', function(done) {
			mockSocket.on('subscribed', function(channel) {
				// socket.io clears socket.rooms on disconnect, check that it's not relied on
				mockSocket.rooms = []
				mockSocket.emit('disconnect')
			})

			realtimeAdapter.unsubscribe = function() {
				done()
			}

			wsMock.emit('connection', mockSocket)
			mockSocket.emit('subscribe', {channel: "c"})
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