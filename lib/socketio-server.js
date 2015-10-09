'use strict';

var KafkaHelper = require('./kafka-helper')
var Stream = require('./stream')

function SocketIoServer(zookeeper, socketio_port, kafka, io) {
	var _this = this

	this.kafka = kafka || new KafkaHelper(zookeeper)

	// This handler is for realtime messages, not resends
	this.kafka.on('message', function(message, streamId) {
		// Increment expected counter
		var stream = _this.streams[streamId]
		if (stream) {
			stream.counter = message._C + 1
		}

		_this.emitUiMessage(message, streamId)
	})
	
	this.io = io || require('socket.io')(socketio_port);

	this.io.on('connection', function (socket) {
		console.log("Client connected: "+socket.id)
		
		socket.on('subscribe', function(request) {
			console.log("subscribe: "+JSON.stringify(request))
			_this.handleSubscribeRequest(socket, request)
		})

		socket.on('unsubscribe', function(request) {
			console.log("unsubscribe: "+JSON.stringify(request))
			_this.handleUnsubscribeRequest(socket, request)
		})

		socket.on('resend', function(request) {
			console.log("resend: "+JSON.stringify(request))
			_this.handleResendRequest(socket, request)
		})
		
		socket.on('disconnect', function() {
			_this.handleDisconnectRequest(socket)
		})
	})

	this.streams = {}
}

SocketIoServer.prototype.handleResendRequest = function(socket, req) {
	var _this = this
	var from = null
	var	to = null
	var handler = function(message) {
		// Emit to client private stream
		message._sub = req.sub
		_this.emitUiMessage(message, socket.id)
	}
	var tryStartResend = function() {
		if (from!=null && to!=null) {
			if (to<0 || to<from) {
				console.log("Nothing to resend for stream "+req.channel)
				socket.emit('no_resend', {channel: req.channel, sub: req.sub, next: to+1})
			}
			else {
				socket.emit('resending', {channel: req.channel, sub: req.sub, from:from, to:to})
				_this.kafka.resend(req.channel, from, to, handler, function() {
					console.log("Resend complete! Emitting resent event")
					socket.emit('resent', {channel: req.channel, sub: req.sub, from:from, to:to})
				})
			}
		}
	}

	// Subscribe from beginning
	if (req.resend_all===true) {
		console.log("Requested resend for all messages on stream "+req.channel)
		_this.kafka.getOffset(req.channel, true, function(minOffset) {
			from = minOffset
			tryStartResend()
		})
		_this.kafka.getOffset(req.channel, false, function(maxOffset) {
			to = maxOffset - 1
			tryStartResend()
		})
	}
	// Subscribe from a given offset 
	else if (req.resend_from!=null) {
		console.log("Requested resend from "+req.resend_from+" on stream "+req.channel)

		_this.kafka.getOffset(req.channel, false, function(maxOffset) {
			to = maxOffset - 1

			if (req.resend_to < to)
				to = req.resend_to

			_this.kafka.getOffset(req.channel, true, function(minOffset) {
				from = Math.min(maxOffset, Math.max(minOffset, req.resend_from))
				tryStartResend()
			})
		})
	}
	// Subscribe from a given time 
	else if (req.resend_from_time!=null) {
		console.log("Requested resend from "+req.resend_from_time+", "+new Date(req.resend_from_time)+" on stream "+req.channel)
		// TODO: partition 0 assumed
		_this.kafka.getFirstOffsetAfter(req.channel, 0, req.resend_from_time, function(offset) {
			delete req.resend_from_time
			req.resend_from = offset
			// Convert it to a normal resend_from request
			_this.handleResendRequest(socket, req)
		})
	}
	// Subscribe from last N messages
	else if (req.resend_last!=null) {
		console.log("Requested the last "+req.resend_last+" messages in stream "+req.channel)
		_this.kafka.getOffset(req.channel, false, function(maxOffset) {
			to = maxOffset - 1

			// Now check the earliest offset
			_this.kafka.getOffset(req.channel, true, function(minOffset) {
				from = Math.max(maxOffset - Math.max(req.resend_last,0), minOffset)
				tryStartResend()
			})
		})
	}
}

SocketIoServer.prototype.emitUiMessage = function(message, streamId) {
	this.io.sockets.in(streamId).emit('ui', message);
}

SocketIoServer.prototype.handleSubscribeRequest = function(socket, request) {
	var _this = this

	console.log("subscribe: "+JSON.stringify(request.channel)+", client: "+socket.id)

	// Check that the request is valid
	if (!request.channel) {
		console.log("subscribe error, request was: "+JSON.stringify(request))
		socket.emit('subscribed', {
			channel: request.channel, 
			error: "request.channel not defined. Are you using an outdated client?"
		})
	}
	else {
		var stream = this.streams[request.channel]

		// Create Stream if it does not exist
		if (!stream) {
			stream = new Stream(request.channel, 'subscribing')
			this.streams[request.channel] = stream

			this.kafka.subscribe(stream.id, request.from, function(streamId, from, err) {
				if (err) {
					stream.emit('subscribed', from, err)
					delete _this.streams[streamId]
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
			socket.join(stream.id, function(err) {
				if (err) {
					onError(err)
					console.log("socket.io error joining room "+stream.id+": "+err)
				}
				else {
					console.log("Socket "+socket.id+" is now in rooms: "+socket.rooms)

					// Send response
					socket.emit('subscribed', {
						channel: stream.id,
						from: counter
					})
				}
			})
		}

		var onError = function(err) {
			socket.emit('subscribed', {
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
		console.log("checkRoomEmpty: Clients remaining on stream "+streamId+": "+Object.keys(room).length)
	}
	else {
		console.log("checkRoomEmpty: stream "+streamId+" has no clients remaining, unsubscribing Kafka...")
		this.kafka.unsubscribe(streamId)
		delete this.streams[streamId]
	}
}

SocketIoServer.prototype.handleUnsubscribeRequest = function(socket, request) {
	var _this = this

	console.log("handleUnsubscribeRequest: socket "+socket.id+" unsubscribed from stream "+request.channel)

	socket.leave(request.channel, function(err) {
		if (err)
			console.log("ERROR leaving stream "+request.channel+": "+err)

		console.log("handleUnsubscribeRequest: Socket "+socket.id+" is now in rooms: "+socket.rooms)
		_this.checkRoomEmpty(request.channel)
		socket.emit('unsubscribed', {channel:request.channel, error:err})
	})

}

SocketIoServer.prototype.handleDisconnectRequest = function(socket) {
	var _this = this
	console.log("handleDisconnectRequest: socket "+socket.id+" was on streams: "+socket.rooms)

	var unsub = socket.rooms.slice() // duplicate the list to avoid modifying it while looping
	
	// Unsubscribe from all streams
	unsub.forEach(function(streamId) {
		_this.handleUnsubscribeRequest(socket, {channel:streamId})	
	})
}

exports.SocketIoServer = SocketIoServer