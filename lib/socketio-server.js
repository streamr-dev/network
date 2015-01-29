'use strict';

var KafkaHelper = require('./kafka-helper').KafkaHelper

function SocketIoServer(zookeeper, socketio_port) {
	var _this = this

	this.kafka = new KafkaHelper(zookeeper)
	this.kafka.on('message', this.emitUiMessage)
	
	this.io = require('socket.io')(socketio_port);

	this.io.on('connection', function (socket) {
		console.log("Client connected: "+socket.id)

		// Channels the socket is currently on
		var channels = []
		
		socket.on('subscribe', function(subscriptions) {
			_this.handleSubscribeRequest(socket, channels, subscriptions)
		})

		socket.on('unsubscribe', function(data) {
			_this.handleUnsubscribeRequest(data.channels)
		})

		socket.on('resend', function(req) {
			console.log("Resend request: "+JSON.stringify(req))
			_this.handleResendRequest(socket, req)
		})

		socket.on('ui', _this.emitUiMessage)
		
		socket.on('disconnect', _this.handleDisconnectRequest)
	})
}

SocketIoServer.prototype.handleResendRequest = function(socket, req) {
	var _this = this
	var from = null
	var	to = null
	var handler = function(message) {
		// Emit to client private channel
		emitUiMessage(message, socket.id)
	}
	var callback = function() {
		console.log("Resend complete! Emitting resent event")
		
		// The nothing-to-resend response does not contain from and to fields
		if (to<0) 
			socket.emit('resent', {channel: req.channel})
		else 
			socket.emit('resent', {channel: req.channel, from:from, to:to})
	}
	var tryStartResend = function() {
		if (from!=null && to!=null) {
			socket.emit('expect', {channel: req.channel, from:from})
			_this.kafka.resend(req.channel, from, to, handler, callback)
		}
	}

	// Subscribe from beginning
	if (req.resend_all===true) {
		console.log("Requested resend for all messages on channel "+req.channel)
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
		console.log("Requested resend from "+req.resend_from+" on channel "+req.channel)

		_this.kafka.getOffset(req.channel, false, function(maxOffset) {
			to = maxOffset - 1
			
			_this.kafka.getOffset(req.channel, true, function(minOffset) {
				from = Math.min(maxOffset, Math.max(minOffset, req.resend_from))
				tryStartResend()
			})
		})
	}
	// Subscribe from last N messages
	else if (req.resend_last) {
		console.log("Requested the last "+req.resend_last+" messages in channel "+req.channel)
		_this.kafka.getOffset(req.channel, false, function(maxOffset) {
			to = maxOffset - 1

			// Now check the earliest offset
			_this.kafka.getOffset(req.channel, true, function(minOffset) {
				from = Math.max(maxOffset - req.resend_last, minOffset)
				tryStartResend()
			})
		})
	}
}

SocketIoServer.prototype.emitUiMessage = function(data, channel) {
	// Try to parse channel from message if not specified
	if (!channel) {
		if (typeof data == 'string' || data instanceof String) {
			var idx = data.indexOf("\"channel\":")
			channel = data.substring(idx+11, data.indexOf("\"",idx+11))
		}
		else channel = data.channel
	}
	
	this.io.sockets.in(channel).emit('ui', data);
}

SocketIoServer.prototype.handleSubscribeRequest = function(socket, channels, subscriptions) {
	var _this = this
	var subCount = 0
	console.log("Client "+socket.id+" subscriptions: "+JSON.stringify(subscriptions))
	
	subscriptions.forEach(function(sub) {
		socket.join(sub.channel, function(err) {
			console.log("Socket "+socket.id+" is now in rooms: "+socket.rooms)
			subCount++
			
			if (subCount===subscriptions.length) {
				// Ack subscription
				socket.emit('subscribed', {channels:channels, error:err})						
			}
			
			var resendReq = sub.options
			resendReq.channel = sub.channel
			_this.handleResendRequest(socket, resendReq)
		})

		channels.push(sub.channel)
		_this.kafka.subscribe(sub.channel)
	})
}

SocketIoServer.prototype.handleUnsubscribeRequest = function(socket, channels, unsubscriptions) {
	if (unsubscriptions) {
		unsubscriptions.forEach(function(channel) {
			console.log("Client "+socket.id+" unsubscribed from channel "+channel)
			socket.leave(channel, function(err) {
				socket.emit('unsubscribe', {channel:channel, error:err})
				console.log("Socket "+socket.id+" is now in rooms: "+socket.rooms)
			})
		})
	}
}

SocketIoServer.prototype.handleDisconnectRequest = function(socket, channels) {
	var _this = this
	console.log("Client disconnected: "+socket.id+", was on channels: "+channels)
	channels.forEach(function(channel) {
		_this.io.sockets.in(channel).emit('client-disconnect', socket.id);
		
		var room = _this.io.sockets.adapter.rooms[channel]
		if (room) {
			var count = Object.keys(room).length
			console.log("Clients remaining on channel "+channel+": "+count)
		}
		else {
			console.log("Channel "+channel+" has no clients remaining, unsubscribing Kafka...")
			_this.kafka.unsubscribe(channel)
		}
	})
}


exports.SocketIoServer = SocketIoServer