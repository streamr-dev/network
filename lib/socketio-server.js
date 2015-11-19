'use strict';

var events = require('events')
var debug = require('debug')('SocketIoServer')
var debugProtocol = require('debug')('SocketIoServer:protocol')
var constants = require('./constants')
var KafkaHelper = require('./kafka-helper')
var Stream = require('./stream')
var Connection = require('./connection')

function SocketIoServer(zookeeper, socketio_port, kafka, io) {
	var _this = this

	this.kafka = kafka || new KafkaHelper(zookeeper)

	// This handler is for realtime messages, not resends
	this.kafka.on('message', function(message, streamId) {
		// Increment expected counter
		var stream = _this.streams[streamId]
		if (stream) {
			stream.counter = message[constants.COUNTER_KEY] + 1
			stream.cache.add(message)
		}

		_this.emitUiMessage(message, streamId)
	})
	
	this.io = io || require('socket.io')(socketio_port);

	this.io.on('connection', function (socket) {
		debug("connection: %s", socket.id)
		
		var connection = new Connection(socket.id, socket)

		socket.on('subscribe', function(request) {
			debugProtocol("subscribe: %s: %o", connection.id, request)
			_this.handleSubscribeRequest(connection, request)
		})

		socket.on('unsubscribe', function(request) {
			debugProtocol("unsubscribe: %s: %o", connection.id, request)
			_this.handleUnsubscribeRequest(connection, request)
		})

		socket.on('resend', function(request) {
			debugProtocol("resend: %s: %o", connection.id, request)
			_this.handleResendRequest(connection, request)
		})
		
		socket.on('disconnect', function() {
			debugProtocol("disconnect: %s", connection.id)
			_this.handleDisconnectRequest(connection)
		})
	})

	this.streams = {}
}

SocketIoServer.prototype.__proto__ = events.EventEmitter.prototype;

SocketIoServer.prototype.handleResendRequest = function(connection, req) {

	var stream = this.streams[req.channel]
	if (!stream)
		stream = this.createStreamObject(req.channel)

	var _this = this

	var handler = function(message) {
		// Emit to client private stream
		message[constants.SUB_KEY] = req.sub
		_this.emitUiMessage(message, connection.id)
		stream.cache.add(message)
	}
	var resendProtocolWrapper = function(first, last, resendFunc) {
		var resendingMsg = {channel: req.channel, sub: req.sub, from:first, to:last}
		debugProtocol('resending: %s: %o', connection.id, resendingMsg)
		connection.socket.emit('resending', resendingMsg)
		resendFunc(function() {
			var resentMsg = {channel: req.channel, sub: req.sub, from:first, to:last}
			debugProtocol('resent: %s: %o', connection.id, resentMsg)
			connection.socket.emit('resent', resentMsg)			
		})
	}
	var tryStartResend = function(from, to) {
		if (from!=null && to!=null) {
			if (to<0 || to<from) {
				var noResendMsg = {channel: req.channel, sub: req.sub, next: to+1}
				debugProtocol('no_resend: %s: %o', connection.id, noResendMsg)
				connection.socket.emit('no_resend', noResendMsg)
			}
			else {
				resendProtocolWrapper(from, to, function(cb) {
					_this.kafka.resend(req.channel, from, to, handler, cb)
				})
			}
		}
	}

	// Resend from beginning
	if (req.resend_all===true) {
		var from, to
		_this.kafka.getOffset(req.channel, true, function(minOffset) {
			from = minOffset
			tryStartResend(from, to)
		})
		_this.kafka.getOffset(req.channel, false, function(maxOffset) {
			to = maxOffset - 1
			tryStartResend(from, to)
		})
	}
	// Resend from a given offset 
	else if (req.resend_from!=null) {
		// Check cache
		var stream = this.streams[req.channel]
		var messages = stream.cache.getRange(req.resend_from, req.resend_to)
		if (messages && messages.length>0) {
			resendProtocolWrapper(messages[0][constants.COUNTER_KEY], messages[messages.length-1][constants.COUNTER_KEY], function(cb) {
				messages.forEach(handler)
				cb()
			})
		}
		else {
			var from, to
			_this.kafka.getOffset(req.channel, false, function(maxOffset) {
				to = maxOffset - 1

				if (req.resend_to < to)
					to = req.resend_to

				_this.kafka.getOffset(req.channel, true, function(minOffset) {
					from = Math.min(maxOffset, Math.max(minOffset, req.resend_from))
					tryStartResend(from, to)
				})
			})
		}
	}
	// Resend from a given time 
	else if (req.resend_from_time!=null) {
		// TODO: partition 0 assumed
		var from, to
		_this.kafka.getFirstOffsetAfter(req.channel, 0, req.resend_from_time, function(offset) {
			delete req.resend_from_time
			req.resend_from = offset
			// Convert it to a normal resend_from request
			_this.handleResendRequest(connection, req)
		})
	}
	// Resend the last N messages
	else if (req.resend_last!=null) {
		// Check cache
		var stream = this.streams[req.channel]
		var messages = stream.cache.getLast(req.resend_last)
		if (messages && messages.length>0) {
			resendProtocolWrapper(messages[0][constants.COUNTER_KEY], messages[messages.length-1][constants.COUNTER_KEY], function(cb) {
				messages.forEach(handler)
				cb()
			})
		}
		else {
			var from, to
			_this.kafka.getOffset(req.channel, false, function(maxOffset) {
				to = maxOffset - 1

				// Now check the earliest offset
				_this.kafka.getOffset(req.channel, true, function(minOffset) {
					from = Math.max(maxOffset - Math.max(req.resend_last,0), minOffset)
					tryStartResend(from, to)
				})
			})
		}
	}
}

/**
 * Creates and returns a Stream object, holding the Stream subscription
 * state as well as reference to the message cache.
 * 
 * In normal conditions, the Stream object is cleaned when no more
 * clients are subscribed to it.
 *
 * However, ill-behaving clients could just ask for resends on a Stream
 * and never subscribe to it, which would lead to leaking memory.
 * To prevent this, clean up the Stream object if it doesn't
 * end up in subscribed state within one minute (for example, ill-behaving)
 * clients only asking for resends and never subscribing.
 **/
SocketIoServer.prototype.createStreamObject = function(streamId) {
	var _this = this
	var stream = new Stream(streamId, 'init', this.kafka)
	this.streams[streamId] = stream
	
	stream.stateTimeout = setTimeout(function() {
		if (stream.state !== 'subscribed') {
			debug("Stream %s never got to subscribed state, cleaning..", streamId)
			_this.deleteStreamObject(streamId)
		}
	}, 60*1000)

	this.emit('stream-object-created', stream)
	debug("Stream object created: %o", stream)

	return stream
}

SocketIoServer.prototype.deleteStreamObject = function(streamId) {
	debug("Stream object deleted: %o", this.streams[streamId])
	var stream = this.streams[streamId]
	if (stream) {
		clearTimeout(this.streams[streamId].stateTimeout)
		delete this.streams[streamId]
		this.emit('stream-object-deleted', stream)
	}
}

SocketIoServer.prototype.emitUiMessage = function(message, streamId) {
	this.io.sockets.in(streamId).emit('ui', message);
}

SocketIoServer.prototype.handleSubscribeRequest = function(connection, request) {
	var _this = this

	// Check that the request is valid
	if (!request.channel) {
		var response = {
			channel: request.channel, 
			error: "request.channel not defined. Are you using an outdated client?"
		}
		debugProtocol('subscribed (error): %s: %o', connection.id, response)
		connection.socket.emit('subscribed', response)
	}
	else {
		var stream = this.streams[request.channel]

		// Create Stream if it does not exist
		if (!stream) {
			stream = this.createStreamObject(request.channel)
		}

		// Subscribe it if it's not already subscribed or subscribing
		if (!(stream.state==='subscribed' || stream.state==='subscribing')) {
			stream.state = 'subscribing'
			this.kafka.subscribe(stream.id, request.from, function(streamId, from, err) {
				if (err) {
					stream.emit('subscribed', from, err)

					// Delete the stream ref on subscribe error
					_this.deleteStreamObject(stream.id)

					console.log("Kafka error subscribing to "+stream.id+": "+err)
				}
				else {
					stream.state = 'subscribed'
					stream.counter = from
					stream.emit('subscribed', from)
				}
			})
		}

		var onSubscribe = function(counter) {
			// Join the room
			connection.socket.join(stream.id, function(err) {
				if (err) {
					onError(err)
					console.log("socket.io error joining room "+stream.id+": "+err)
				}
				else {
					connection.addRoom(stream.id)

					debug("Socket %s is now in rooms: %o", connection.id, connection.getRooms())
					var subscribedMsg = {
						channel: stream.id,
						from: counter
					}
					debugProtocol('subscribed: %s: %o', connection.id, subscribedMsg)
					connection.socket.emit('subscribed', subscribedMsg)
				}
			})
		}

		var onError = function(err) {
			connection.socket.emit('subscribed', {
				channel: stream.id,
				error: err
			})
		}

		// If the Stream is subscribed, we're good to go
		if (stream.state === 'subscribed') {
			onSubscribe(stream.counter)
		}
		// If the Stream is not yet subscribed, wait for the event
		if (stream.state !== 'subscribed') {
			stream.once('subscribed', function(from, err) {
				if (err)
					onError(err)
				else 
					onSubscribe(from)
			})
		}
	}
}

SocketIoServer.prototype.checkRoomEmpty = function(streamId) {
	var room = this.io.sockets.adapter.rooms[streamId]
	if (room && Object.keys(room).length>0) {
		debug("checkRoomEmpty: Clients remaining on stream %s: %d", streamId, Object.keys(room).length)
	}
	else {
		debug("checkRoomEmpty: stream %s has no clients remaining, unsubscribing Kafka...", streamId)
		this.kafka.unsubscribe(streamId)
		this.deleteStreamObject(streamId)
	}
}

SocketIoServer.prototype.handleUnsubscribeRequest = function(connection, request) {
	var _this = this

	debug("handleUnsubscribeRequest: socket %s unsubscribed from stream %s", connection.id, request.channel)

	connection.socket.leave(request.channel, function(err) {
		if (err)
			console.log("ERROR leaving stream "+request.channel+": "+err)

		connection.removeRoom(request.channel)
		debug("handleUnsubscribeRequest: Socket %s is now in rooms: %o", connection.id, connection.getRooms())
		_this.checkRoomEmpty(request.channel)
		connection.socket.emit('unsubscribed', {channel:request.channel, error:err})
	})

}

SocketIoServer.prototype.handleDisconnectRequest = function(connection) {
	var _this = this
	debug("handleDisconnectRequest: socket %s was on streams: %o", connection.id, connection.getRooms())

	var unsub = connection.getRooms()
	
	// Unsubscribe from all streams
	unsub.forEach(function(streamId) {
		_this.handleUnsubscribeRequest(connection, {channel:streamId})	
	})
}

exports.SocketIoServer = SocketIoServer