var assert = require('assert'),
	events = require('events'),
	sinon = require('sinon'),
	constants = require('../lib/constants')
	SocketIoServer = require('../lib/socketio-server').SocketIoServer

describe('socketio-server', function () {

	var server
	var kafkaMock
	var kafkaSubs
	var ioMock
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
				delete ioMock.sockets.adapter.rooms[channel][socket.id]	
				console.log("SOCKET MOCK: Socket "+socket.id+" left channel "+channel+", now on: "+socket.rooms)
				cb()
			}
			else throw "Not subscribed to channel "+channel
		}
		return socket
	}

	function msg(data, counter) {
		data[constants.COUNTER_KEY] = counter
		return data
	}

	beforeEach(function() {
		// Mock the Kafka helper
		kafkaMock = new events.EventEmitter
		kafkaSubs = []

		kafkaMock.subscribe = function(channel, from, cb) {
			kafkaSubs.push(channel)
			this.emit('subscribed', channel, from)
			if (cb)
				cb(channel,from)
		}
		kafkaMock.unsubscribe = function(channel) {
			var index = kafkaSubs.indexOf(channel)
			if (index>=0) {
				kafkaSubs.splice(index,1)
				this.emit('unsubscribed', channel)
			}
			else throw "kafkaMock: Tried to unsubscribe from "+channel+", but was not subscribed to it!"
		}
		kafkaMock.resend = function() {}

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
		server = new SocketIoServer('invalid-zookeeper-addr', 0, kafkaMock, ioMock)
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
			socket.on("resending", function(data) {
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

		it('should emit a resending event before starting the resend', function(done) {
			socket.on('resending', function(data) {
				assert.equal(data.channel, "c")
				assert.equal(data.from, 5)
				done()
			})

			ioMock.emit('connection', socket)
			socket.emit('resend', {channel:"c", resend_all:true})
		})

		it('should add the subscription id to messages if present', function(done) {
			kafkaMock.resend = function(channel, from, to, handler, callback) {
				handler({test: 'content'})
			}

			socket.on('ui', function(msg) {
				assert.equal(msg.test, 'content')
				assert.equal(msg._sub, 'foo')
				done()
			})

			ioMock.emit('connection', socket)
			socket.emit('resend', {channel:"c", sub: 'foo', resend_all:true})
		})

		it('should create the Stream object', function() {
			ioMock.emit('connection', socket)
			socket.emit('resend', {channel:"c", resend_all:true})
			assert(server.streams.c !== undefined)
		})

		describe('resend_all', function() {

			it('should query the offsets and request a resend of all messages', function (done) {
				kafkaMock.resend = function(channel, from, to, handler, callback) {
					assert.equal(channel, "c")
					assert.equal(from, 5)
					assert.equal(to, 9)
					assert.equal(expect, 5)

					for (var i=from;i<=to;i++)
						handler(msg({foo:"bar"},i))
					callback()

					assert.equal(msgCounter, to-from+1)
					done()
				}

				ioMock.emit('connection', socket)
				socket.emit('resend', {channel:"c", resend_all:true})
			});

			it('should reference the subscription id in resend state messages', function (done) {
				kafkaMock.resend = function(channel, from, to, handler, callback) {
					for (var i=from;i<=to;i++)
						handler(msg({foo:"bar"},i))
					callback()
				}

				var resendingCalled = false
				socket.on('resending', function(response) {
					assert.equal(response.sub, 'foo')
					resendingCalled = true
				})
				socket.on('resent', function(response) {
					assert.equal(response.sub, 'foo')
					assert(resendingCalled)
					done()
				})

				ioMock.emit('connection', socket)
				socket.emit('resend', {channel:"c", sub:'foo', resend_all:true})
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
						handler(msg({foo:"bar"},i))
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
						handler(msg({foo:"bar"},i))
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

				socket.on('no_resend', function(data) {
					assert.equal(data.next, 10)
					done()
				})

				ioMock.emit('connection', socket)
				socket.emit('resend', {channel:"c", resend_from:15})
			});

			it('should cut the resend if resend_to is given', function (done) {
				kafkaMock.resend = function(channel, from, to, handler, callback) {
					assert.equal(channel, "c")
					assert.equal(from, 7)
					assert.equal(to, 8)
					assert.equal(expect, 7)

					for (var i=from;i<=to;i++)
						handler(msg({foo:"bar"},i))
					callback()

					assert.equal(msgCounter, to-from+1)
					done()
				}

				ioMock.emit('connection', socket)
				socket.emit('resend', {channel:"c", resend_from:7, resend_to:8})
			});

			describe('cache', function() {

				it('should be queried before asking kafka for a resend', function(done) {
					ioMock.emit('connection', socket)
					server.on('stream-object-created', function(stream) {
						stream.cache.getRange = function(from, to) {
							assert.equal(from, 7)
							done()
						}
					})
					socket.emit('resend', {channel:"c", resend_from:7})
				})

				it('should emit messages found in the cache', function(done) {
					ioMock.emit('connection', socket)
					server.on('stream-object-created', function(stream) {
						stream.cache.getRange = function(from, to) {
							assert.equal(from, 0)
							assert.equal(to, 1)
							return [msg({},0),msg({},1)]
						}
					})
					var spy = sinon.spy()
					socket.on('ui', spy)
					socket.on('resent', function() {
						assert.equal(spy.callCount, 2);
						done()
					})
					socket.emit('resend', {channel:"c", resend_from:0, resend_to:1})
				})

				it('should not make another query to kafka if the same resend request arrives from another client', function(done) {
					var resent

					kafkaMock.resend = function(channel, from, to, handler, callback) {
						if (!resent) {
							for (var i=from;i<=to;i++)
								handler(msg({foo:"bar"},i))
							resent = true
							callback()
						}
						else throw "kafkaMock.resend called twice!"
					}

					socket.on('resent', function() {
						console.log("Socket 1 resent")
						var socket2 = createSocketMock("socket2")
						ioMock.emit('connection', socket2)
						socket2.on('resent', function() {
							console.log("Socket 2 resent")
							done()
						})
						console.log(server.streams.c.cache.messages)
						socket2.emit('resend', {channel:"c", resend_from:6, resend_to:7})
					})

					ioMock.emit('connection', socket)
					socket.emit('resend', {channel:"c", resend_from:6, resend_to:7})
				})

			})

		})

		describe('resend_from_time', function() {
			it('should query the offset after given date and request resend from that offset', function (done) {
				var d = Date.now()

				kafkaMock.getFirstOffsetAfter = function(topic, partition, date, cb) {
					assert.equal(d, date)
					cb(7)
				}

				kafkaMock.resend = function(channel, from, to, handler, callback) {
					assert.equal(channel, "c")
					assert.equal(from, 7)
					assert.equal(to, 9)
					assert.equal(expect, 7)

					for (var i=from;i<=to;i++)
						handler(msg({foo:"bar"},i))
					callback()

					assert.equal(msgCounter, to-from+1)
					done()
				}

				ioMock.emit('connection', socket)
				socket.emit('resend', {channel:"c", resend_from_time:d})
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
						handler(msg({foo:"bar"},i))
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

				socket.on('no_resend', function(data) {
					assert.equal(data.next, 10)
					done()
				})

				ioMock.emit('connection', socket)
				socket.emit('resend', {channel:"c", resend_last:0})
			});

			it('should not resend if resend_last is negative', function (done) {
				kafkaMock.resend = function(channel, from, to, handler, callback) {
					throw "Resend should not be called, but it was! From: "+from+", to: "+to
				}

				socket.on('no_resend', function(data) {
					assert.equal(data.next, 10)
					done()
				})

				ioMock.emit('connection', socket)
				socket.emit('resend', {channel:"c", resend_last:-100})
			});

			describe('cache', function() {

				it('should be queried before asking kafka for a resend', function(done) {
					ioMock.emit('connection', socket)
					server.on('stream-object-created', function(stream) {
						stream.cache.getLast = function(count) {
							assert.equal(count, 2)
							done()
						}
					})
					socket.emit('resend', {channel:"c", resend_last:2})
				})

				it('should emit messages found in the cache', function(done) {
					ioMock.emit('connection', socket)
					server.on('stream-object-created', function(stream) {
						stream.cache.getLast = function(count) {
							return [msg({},0),msg({},1)]
						}
					})
					var spy = sinon.spy()
					socket.on('ui', spy)
					socket.on('resent', function() {
						assert.equal(spy.callCount, 2);
						done()
					})
					socket.emit('resend', {channel:"c", resend_last:2})
				})

				it('should not make another query to kafka if the same resend request arrives from another client', function(done) {
					var resent

					kafkaMock.resend = function(channel, from, to, handler, callback) {
						if (!resent) {
							for (var i=from;i<=to;i++)
								handler(msg({foo:"bar"},i))
							resent = true
							callback()
						}
						else throw "kafkaMock.resend called twice!"
					}

					socket.on('resent', function() {
						console.log("Socket 1 resent")
						var socket2 = createSocketMock("socket2")
						ioMock.emit('connection', socket2)
						socket2.on('resent', function() {
							console.log("Socket 2 resent")
							done()
						})
						console.log(server.streams.c.cache.messages)
						socket2.emit('resend', {channel:"c", resend_last:2})
					})

					ioMock.emit('connection', socket)
					socket.emit('resend', {channel:"c", resend_last:2})
				})

			})

		})
	})

	describe('message handling', function() {

		it('should emit kafka messages to sockets in that channel', function (done) {
			// Expecting io.sockets.in(channel).emit('ui', data); 
			ioMock.sockets.in = function(channel) {
				assert.equal(channel, "c")
				return {
					emit: function(event, data) {
						assert.equal(event, 'ui')
						assert.equal(data.foo, "bar")
						done()
					}
				}
			}
			ioMock.emit('connection', socket)
			socket.emit('subscribe', {channel: "c"})
			kafkaMock.emit('message', msg({foo:"bar"},0), "c")
		});

		it('should add kafka messages to cache', function (done) {
			ioMock.emit('connection', socket)
			server.on('stream-object-created', function(stream) {
				stream.cache.add = function(msg) {
					done()
				}
			})
			socket.emit('subscribe', {channel: "c"})
			kafkaMock.emit('message', msg({foo:"bar"},0), "c")
		});

		it('should set stream counter', function () {
			ioMock.emit('connection', socket)
			socket.emit('subscribe', {channel: "c"})
			kafkaMock.emit('message', msg({foo:"bar"},0), "c")
			assert.equal(server.streams.c.counter, 1)
		});

	})

	describe('subscribe', function() {

		it('should create the Stream object', function() {
			ioMock.emit('connection', socket)
			socket.emit('subscribe', {channel: "c"})
			assert(server.streams.c !== undefined)
		})

		it('should subscribe to the requested channel from the next message if from not defined', function (done) {
			// Must get the subscribed event
			var subscribed = false
			var kafkaSubscribed = false

			socket.on('subscribed', function(data) {
				subscribed = true
				assert.equal(data.channel, "c")
				if (subscribed && kafkaSubscribed)
					done()
			})

			kafkaMock.subscribe = function(channel, from, cb) {
				assert(from==null)
				kafkaSubscribed = true
				if (subscribed && kafkaSubscribed)
					done()
				else cb(channel,from)
			}

			ioMock.emit('connection', socket)
			socket.emit('subscribe', {channel: "c"})
		});

		it('should subscribe from the requested message', function (done) {
			// Must get the subscribed event
			var subscribed = false
			var kafkaSubscribed = false

			socket.on('subscribed', function(data) {
				subscribed = true
				assert.equal(data.channel, "c")
				if (subscribed && kafkaSubscribed)
					done()
			})

			kafkaMock.subscribe = function(channel, from, cb) {
				assert(from==null)
				kafkaSubscribed = true
				if (subscribed && kafkaSubscribed)
					done()
				else cb(channel,from)
			}

			ioMock.emit('connection', socket)
			socket.emit('subscribe', {channel: "c"})
		});

		it('should respond with error if channel is not defined', function(done) {
			// Must get the subscribed event
			var subscribed = false
			var kafkaSubscribed = false

			socket.on('subscribed', function(data) {
				assert(data.error!=null)
					done()
			})

			ioMock.emit('connection', socket)
			socket.emit('subscribe', {})
		})

		it('should not resubscribe kafka on new subscription to same stream', function (done) {
			var subscribeCount = 0
			kafkaMock.subscribe = function(channel, from, cb) {
				subscribeCount++
				if (subscribeCount>1)
					throw "Subscribed too many times!"
				cb(channel,from)
			}
			
			var socket2 = createSocketMock("socket2")
			
			socket2.on('subscribed', function(data) {
				done()
			})

			ioMock.emit('connection', socket)
			socket.emit('subscribe', {channel: "c"})

			ioMock.emit('connection', socket2)
			socket2.emit('subscribe', {channel: "c"})
		});

		it('should report the correct next counter to all subscribers', function (done) {
			var socket2 = createSocketMock("socket2")
			
			kafkaMock.subscribe = function(channel, from, cb) {
				assert(from==null)
				cb(channel, 5)
			}

			socket.on('subscribed', function(data) {
				assert.equal(data.from, 5)
			})

			socket2.on('subscribed', function(data) {
				assert.equal(data.from, 5)
				done()
			})

			ioMock.emit('connection', socket)
			socket.emit('subscribe', {channel: "c"})

			ioMock.emit('connection', socket2)
			socket2.emit('subscribe', {channel: "c"})
		});

		it('should report the correct next counter to a late subscriber', function (done) {

			kafkaMock.subscribe = function(channel, from, cb) {
				assert(from==null)
				cb(channel, 5)
			}

			socket.on('subscribed', function(data) {
				assert.equal(data.from, 5)

				socket.on('ui', function(msg) {
					assert.equal(msg[constants.COUNTER_KEY], 5)

					// Then subscribe socket2, which should subscribe from message 6
					var socket2 = createSocketMock("socket2")

					socket2.on('subscribed', function(data) {
						assert.equal(data.from, 6)
						done()
					})

					ioMock.emit('connection', socket2)
					socket2.emit('subscribe', {channel: "c"})
				})
				kafkaMock.emit('message', msg({foo:"bar"},5), "c")
			})

			ioMock.emit('connection', socket)
			socket.emit('subscribe', {channel: "c"})

		});

	})

	describe('unsubscribe', function() {

		it('should make the socket leave the channel and emit unsubscribed event', function(done) {

			socket.on('subscribed', function(data) {
				assert.equal(Object.keys(ioMock.sockets.adapter.rooms['c']).length, 1)
				socket.emit('unsubscribe', {channel: 'c'})
			})

			socket.on('unsubscribed', function(data) {
				assert.equal(data.channel, 'c')
				assert.equal(socket.rooms.length, 0)
				done()
			})

			ioMock.emit('connection', socket)
			socket.emit('subscribe', {channel: "c"})
		})

		it('should unsubscribe kafka if there are no more sockets on the channel', function(done) {
			socket.on('subscribed', function(data) {
				socket.emit('unsubscribe', {channel: 'c'})
			})

			kafkaMock.on('unsubscribed', function(channel) {
				assert.equal(channel, 'c')
				done()
			})

			ioMock.emit('connection', socket)
			socket.emit('subscribe', {channel: "c"})
		})

		it('should NOT unsubscribe kafka if there are sockets remaining on the channel', function(done) {
			var socket2 = createSocketMock("socket2")

			socket2.on('subscribed', function(channel) {
				socket2.emit('unsubscribe', {channel: 'c'})
			})

			kafkaMock.on('unsubscribed', function(channel) {
				throw "Should not have unsubscribed!"
			})

			ioMock.emit('connection', socket)
			socket.emit('subscribe', {channel: "c"})

			ioMock.emit('connection', socket2)
			socket2.emit('subscribe', {channel: "c"})
			done()
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

		it('should work with subscribe from', function(done) {
			socket.once('subscribed', function(data) {
				assert.equal(data.from, 5)
				socket.emit('unsubscribe', {channel: 'c'})
			})

			socket.once('unsubscribed', function() {
				socket.once('subscribed', function(data) {
					assert.equal(data.from, 7)
					done()
				})
				socket.emit('subscribe', {channel: "c", from: 7})
			})

			ioMock.emit('connection', socket)
			socket.emit('subscribe', {channel: "c", from: 5})
		})
	})

	describe('disconnect', function() {
		it('should unsubscribe kafka on channels where there are no more connections', function(done) {
			socket.on('subscribed', function(channel) {
				socket.emit('disconnect')
			})

			kafkaMock.on('unsubscribed', function(channel) {
				assert.equal(channel, 'c')
				done()
			})

			ioMock.emit('connection', socket)
			socket.emit('subscribe', {channel: "c"})
		})

	})

	describe('createStreamObject', function() {
		it('should add the Stream to the lookup', function() {
			var stream = server.createStreamObject('streamId')
			assert(server.streams.streamId === stream)
		})

		it('should create the Stream with correct values', function() {
			var stream = server.createStreamObject('streamId')
			assert.equal(stream.id, 'streamId')
			assert.equal(stream.state, 'init')
			assert(stream.cache !== undefined)
			assert(stream.cache.resender === kafkaMock)
		})
	})

});