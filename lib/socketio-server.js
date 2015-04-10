'use strict';

var KafkaHelper = require('./kafka-helper').KafkaHelper

function SocketIoServer(zookeeper, socketio_port, kafka, io) {
	var _this = this

	this.kafka = kafka || new KafkaHelper(zookeeper)
	this.kafka.on('message', function(data, channel) {
		_this.emitUiMessage(data, channel)
	})
	
	this.io = io || require('socket.io')(socketio_port);

	this.io.on('connection', function (socket) {
		console.log("Client connected: "+socket.id)

		// Channels the socket is currently on
		var channels = []
		socket._streamrChannels = channels
		
		socket.on('subscribe', function(request) {
			_this.handleSubscribeRequest(socket, channels, request)
		})

		socket.on('unsubscribe', function(data) {
			console.log("unsubscribe: "+JSON.stringify(data))
			_this.handleUnsubscribeRequest(socket, channels, data.channels)
		})

		socket.on('resend', function(req) {
			console.log("Resend request: "+JSON.stringify(req))
			_this.handleResendRequest(socket, req)
		})
		
		socket.on('disconnect', function() {
			_this.handleDisconnectRequest(socket, channels)
		})
	})
}

SocketIoServer.prototype.handleResendRequest = function(socket, req, offsetCallback) {
	var _this = this
	var from = null
	var	to = null
	var handler = function(message) {
		// Emit to client private channel
		_this.emitUiMessage(message, socket.id)
	}
	var resentCallback = function() {
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

			if (to<0 || to<from) {
				console.log("Nothing to resend for channel "+req.channel)
				if (offsetCallback) {
					offsetCallback({
						from: from
						resend: false,
					})
				}
				
			}
			else {
				if (offsetCallback) {
					offsetCallback({
						from: from,
						to: to,
						resend: true,
					})
				}

				_this.kafka.resend(req.channel, from, to, handler, resentCallback)
			}
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
	else if (req.resend_last!=null) {
		console.log("Requested the last "+req.resend_last+" messages in channel "+req.channel)
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

SocketIoServer.prototype.emitUiMessage = function(data, channel) {
	this.io.sockets.in(channel).emit('ui', data);
}

SocketIoServer.prototype.handleSubscribeRequest = function(socket, channels, request) {
	var _this = this

	console.log("subscribe: "+JSON.stringify(subscriptions)+", client: "+socket.id)

	// First join the socketio room
	socket.join(request.channel, function(err) {
		if (err) {
			socket.emit('subscribed', {
				channel: request.channel, 
				error:err
			})
			console.log("Error joining room "+request.channel+": "+err)
		}
		else {
			console.log("Socket "+socket.id+" is now in rooms: "+socket.rooms)
			
			var resendReq = request.options || {}
			resendReq.channel = request.channel
			_this.handleResendRequest(socket, resendReq, function(offsets, err) {
				if (err) {
					socket.emit('subscribed', {
						channel: request.channel, 
						error: err
					})
					console.log("Error getting offsets for channel "+request.channel+": "+err)
				}
				socket.emit('subscribed', {
					channel: request.channel,
					from: offsets.from,
					resend: (offsets.resend ? {from: offsets.from, to: offsets.to})
				})
				channels.push(request.channel)
				_this.kafka.subscribe(request.channel)
			})
		}
	})


}

SocketIoServer.prototype.checkChannelEmpty = function(channel) {
	var room = this.io.sockets.adapter.rooms[channel]
	if (room && Object.keys(room).length>0) {
		console.log("Clients remaining on channel "+channel+": "+Object.keys(room).length)
	}
	else {
		console.log("Channel "+channel+" has no clients remaining, unsubscribing Kafka...")
		this.kafka.unsubscribe(channel)
	}
}

SocketIoServer.prototype.handleUnsubscribeRequest = function(socket, channels, unsubscriptions) {
	var _this = this
	if (unsubscriptions) {
		unsubscriptions.forEach(function(channel) {
			console.log("Client "+socket.id+" unsubscribed from channel "+channel)
			socket.leave(channel, function(err) {
				// Remove from channels array
				var index = channels.indexOf(channel);
				if (index > -1) {
				    channels.splice(index, 1);
				}

				socket.emit('unsubscribed', {channel:channel, error:err})
				console.log("Socket "+socket.id+" is now in rooms: "+socket.rooms)
				_this.checkChannelEmpty(channel)
			})
		})
	}
}

SocketIoServer.prototype.handleDisconnectRequest = function(socket, channels) {
	var _this = this
	console.log("Client disconnected: "+socket.id+", was on channels: "+channels)
	// Auto-unsubscribe from all channels
	this.handleUnsubscribeRequest(socket, channels, channels)
}


exports.SocketIoServer = SocketIoServer