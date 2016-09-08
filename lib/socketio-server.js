'use strict';

var events = require('events')
var debug = require('debug')('SocketIoServer')
var debugProtocol = require('debug')('SocketIoServer:protocol')
var constants = require('./constants')
var Stream = require('./stream')
var Connection = require('./connection')

function SocketIoServer(http, realtimeAdapter, historicalAdapter, io) {
	var _this = this

	this.realtimeAdapter = realtimeAdapter
	this.historicalAdapter = historicalAdapter

	// This handler is for realtime messages, not resends
	this.realtimeAdapter.on('message', function(message, streamId) {
		_this.broadcastMessage(message, streamId)
	})
	
	this.io = io || require('socket.io')(http);

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
	var _this = this

	var requestRef = {channel: req.channel, sub: req.sub}

	function sendMessage(message) {
		// "broadcast" to the channel of this connection (ie. this single client) and specific subscription id
		_this.unicastMessage(message, connection, req.sub)
	}
	function sendResending() {
		debugProtocol('resending: %s: %o', connection.id, requestRef)
		connection.socket.emit('resending', requestRef)
	}
	function sendResent() {
		debugProtocol('resent: %s: %o', connection.id, requestRef)
		connection.socket.emit('resent', requestRef)
	}
	function sendNoResend() {
		debugProtocol('no_resend: %s: %o', connection.id, requestRef)
		connection.socket.emit('no_resend', requestRef)
	}

	var nothingToResend = true
	function msgHandler(msg) {
		if (nothingToResend) {
			nothingToResend = false
			sendResending()
		}
		sendMessage(msg)
	}
	function doneHandler() {
		if (nothingToResend) {
			sendNoResend()
		}
		else {
			sendResent()
		}
	}

	// Resend all
	if (req.resend_all===true) {
		this.historicalAdapter.getAll(req.channel, msgHandler, doneHandler)
	}
	// Resend range
	else if (req.resend_from != null && req.resend_to != null) {
		this.historicalAdapter.getOffsetRange(req.channel, req.resend_from, req.resend_to, msgHandler, doneHandler)
	}
	// Resend from a given offset 
	else if (req.resend_from != null) {
		this.historicalAdapter.getFromOffset(req.channel, req.resend_from, msgHandler, doneHandler)
	}
	// Resend from a given time 
	else if (req.resend_from_time != null) {
		this.historicalAdapter.getFromTimestamp(req.channel, req.resend_from_time, msgHandler, doneHandler)
	}
	// Resend the last N messages
	else if (req.resend_last != null) {
		this.historicalAdapter.getLast(req.channel, req.resend_last, msgHandler, doneHandler)
	}
	else {
		debug("handleResendRequest: unknown resend request: %o", req)
		sendNoResend()
	}
}

/**
 * Creates and returns a Stream object, holding the Stream subscription state.
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
	var stream = new Stream(streamId, 'init')
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

SocketIoServer.prototype.unicastMessage = function(message, connection, subId) {
	connection.socket.emit('u', {m: message, sub:subId})
}

SocketIoServer.prototype.broadcastMessage = function(message, streamId) {
	this.io.sockets.in(streamId).emit('b', message);
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
		var requestRef = {channel: request.channel}

		// Create Stream if it does not exist
		if (!stream) {
			stream = this.createStreamObject(request.channel)
		}

		// Subscribe now if the channel is not already subscribed or subscribing
		if (!(stream.state==='subscribed' || stream.state==='subscribing')) {
			stream.state = 'subscribing'
			this.realtimeAdapter.subscribe(stream.id, function(err) {
				if (err) {
					stream.emit('subscribed', err)

					// Delete the stream ref on subscribe error
					_this.deleteStreamObject(stream.id)

					console.log("Error subscribing to "+stream.id+": "+err)
				}
				else {
					stream.state = 'subscribed'
					stream.emit('subscribed')
				}
			})
		}

		var onSubscribe = function() {
			// Join the room
			connection.socket.join(stream.id, function(err) {
				if (err) {
					onError(err)
					console.log("socket.io error joining room "+stream.id+": "+err)
				}
				else {
					connection.addRoom(stream.id)
					debug("Socket %s is now in rooms: %o", connection.id, connection.getRooms())
					debugProtocol('subscribed: %s: %o', connection.id, requestRef)
					connection.socket.emit('subscribed', requestRef)
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
			onSubscribe()
		}
		// If the Stream is not yet subscribed, wait for the event
		if (stream.state !== 'subscribed') {
			stream.once('subscribed', function(err) {
				if (err)
					onError(err)
				else 
					onSubscribe()
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
		debug("checkRoomEmpty: stream %s has no clients remaining, unsubscribing realtimeAdapter...", streamId)
		this.realtimeAdapter.unsubscribe(streamId)
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

module.exports = SocketIoServer
