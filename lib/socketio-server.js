'use strict';

var events = require('events')
var debug = require('debug')('SocketIoServer')
var debugProtocol = require('debug')('SocketIoServer:protocol')
var constants = require('./constants')
var Stream = require('./stream')
var Connection = require('./connection')

var DEFAULT_PARTITION = 0

function SocketIoServer(http, realtimeAdapter, historicalAdapter, latestOffsetFetcher, io) {
	var _this = this

	this.realtimeAdapter = realtimeAdapter
	this.historicalAdapter = historicalAdapter
	this.latestOffsetFetcher = latestOffsetFetcher

	// This handler is for realtime messages, not resends
	this.realtimeAdapter.on('message', function(messageAsArray, streamId, streamPartition) {
		_this.broadcastMessage(messageAsArray, streamId, streamPartition)
	})
	
	this.io = io || require('socket.io')(http, {
		path: '/api/v1/socket.io'
	});

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

	var streamId = req.channel
	var streamPartition = req.partition || DEFAULT_PARTITION

	var requestRef = {channel: streamId, partition: streamPartition, sub: req.sub}

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
		} else {
			sendResent()
		}
	}

	this.latestOffsetFetcher.fetchOffset(streamId, streamPartition).then(function(latestOffset) {
		// Resend all
		if (req.resend_all===true) {
			_this.historicalAdapter.getAll(streamId, streamPartition, msgHandler, doneHandler, latestOffset)
		}
		// Resend range
		else if (req.resend_from != null && req.resend_to != null) {
			_this.historicalAdapter.getOffsetRange(streamId, streamPartition, req.resend_from, req.resend_to, msgHandler, doneHandler, latestOffset)
		}
		// Resend from a given offset
		else if (req.resend_from != null) {
			_this.historicalAdapter.getFromOffset(streamId, streamPartition, req.resend_from, msgHandler, doneHandler, latestOffset)
		}
		// Resend the last N messages
		else if (req.resend_last != null) {
			_this.historicalAdapter.getLast(streamId, streamPartition, req.resend_last, msgHandler, doneHandler, latestOffset)
		}
		// Resend from a given time
		else if (req.resend_from_time != null) {
			_this.historicalAdapter.getFromTimestamp(streamId, streamPartition, req.resend_from_time, msgHandler, doneHandler)
		}
		else {
			debug("handleResendRequest: unknown resend request: %o", req)
			sendNoResend()
		}
	}).catch(function(e) {
		console.error(e)
	})
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
SocketIoServer.prototype.createStreamObject = function(streamId, streamPartition) {
	if (streamId == null || streamPartition == null) {
		throw "streamId or streamPartition not given!"
	}

	var _this = this
	var stream = new Stream(streamId, streamPartition, 'init')
	this.streams[this.getStreamLookupKey(streamId, streamPartition)] = stream
	
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

SocketIoServer.prototype.getStreamLookupKey = function(streamId, streamPartition) {
	return streamId+'-'+streamPartition
}

SocketIoServer.prototype.getStreamObject = function(streamId, streamPartition) {
	return this.streams[this.getStreamLookupKey(streamId, streamPartition)]
}

SocketIoServer.prototype.deleteStreamObject = function(streamId, streamPartition) {
	if (streamId == null || streamPartition == null) {
		throw "streamId or streamPartition not given!"
	}

	var stream = this.getStreamObject(streamId, streamPartition)
	debug("Stream object deleted: %o", stream)
	if (stream) {
		clearTimeout(stream.stateTimeout)
		delete this.streams[this.getStreamLookupKey(streamId, streamPartition)]
		this.emit('stream-object-deleted', stream)
	}
}

SocketIoServer.prototype.unicastMessage = function(message, connection, subId) {
	connection.socket.emit('u', {m: message, sub:subId})
}

SocketIoServer.prototype.broadcastMessage = function(message, streamId, streamPartition) {
	this.io.sockets.in(this.getStreamLookupKey(streamId, streamPartition)).emit('b', message);
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
		var streamId = request.channel
		var streamPartition = request.partition || DEFAULT_PARTITION
		var stream = this.getStreamObject(streamId, streamPartition)
		var requestRef = {channel: streamId, partition: streamPartition}

		// Create Stream if it does not exist
		if (!stream) {
			stream = this.createStreamObject(streamId, streamPartition)
		}

		// Subscribe now if the channel is not already subscribed or subscribing
		if (!(stream.state==='subscribed' || stream.state==='subscribing')) {
			stream.state = 'subscribing'
			this.realtimeAdapter.subscribe(streamId, streamPartition, function(err) {
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
			connection.socket.join(_this.getStreamLookupKey(streamId, streamPartition), function(err) {
				if (err) {
					onError(err)
					console.log("socket.io error joining room "+_this.getStreamLookupKey(streamId, streamPartition)+": "+err)
				}
				else {
					connection.addStream(stream)
					debug("Socket %s is now in streams: %o", connection.id, connection.getStreams())
					debugProtocol('subscribed: %s: %o', connection.id, requestRef)
					connection.socket.emit('subscribed', requestRef)
				}
			})
		}

		var onError = function(err) {
			connection.socket.emit('subscribed', {
				channel: streamId,
				partition: streamPartition,
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

SocketIoServer.prototype.checkRoomEmpty = function(streamId, streamPartition) {
	var key = this.getStreamLookupKey(streamId, streamPartition)
	var room = this.io.sockets.adapter.rooms[key]
	if (room && Object.keys(room).length>0) {
		debug("checkRoomEmpty: Clients remaining on %s: %d", key, Object.keys(room).length)
	}
	else {
		debug("checkRoomEmpty: %s has no clients remaining, unsubscribing realtimeAdapter...", key)
		this.realtimeAdapter.unsubscribe(streamId, streamPartition)
		this.deleteStreamObject(streamId, streamPartition)
	}
}

SocketIoServer.prototype.handleUnsubscribeRequest = function(connection, request) {
	var _this = this

	var streamId = request.channel
	var streamPartition = request.partition || DEFAULT_PARTITION
	var key = this.getStreamLookupKey(streamId, streamPartition)

	debug("handleUnsubscribeRequest: socket %s unsubscribed from stream %s partition ", connection.id, streamId, streamPartition)

	connection.socket.leave(key, function(err) {
		if (err)
			console.log("ERROR leaving room "+key+": "+err)

		connection.removeStream(streamId, streamPartition)
		debug("handleUnsubscribeRequest: Socket %s is now in rooms: %o", connection.id, connection.getStreams())
		_this.checkRoomEmpty(streamId, streamPartition)
		connection.socket.emit('unsubscribed', {channel: streamId, partition: streamPartition, error:err})
	})

}

SocketIoServer.prototype.handleDisconnectRequest = function(connection) {
	var _this = this
	debug("handleDisconnectRequest: socket %s was on streams: %o", connection.id, connection.getStreams())

	var unsub = connection.getStreams()
	
	// Unsubscribe from all streams
	unsub.forEach(function(stream) {
		_this.handleUnsubscribeRequest(connection, {channel: stream.id, partition: stream.partition})
	})
}

module.exports = SocketIoServer
