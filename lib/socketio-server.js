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
			console.log("subscribe: "+JSON.stringify(request))
			_this.handleSubscribeRequest(socket, channels, request)
		})

		socket.on('unsubscribe', function(request) {
			console.log("unsubscribe: "+JSON.stringify(request))
			_this.handleUnsubscribeRequest(socket, channels, request)
		})

		socket.on('resend', function(request) {
			console.log("resend: "+JSON.stringify(request))
			_this.handleResendRequest(socket, request)
		})
		
		socket.on('disconnect', function() {
			_this.handleDisconnectRequest(socket, channels)
		})
	})
}

SocketIoServer.prototype.handleResendRequest = function(socket, req) {
	var _this = this
	var from = null
	var	to = null
	var handler = function(message) {
		// Emit to client private channel
		_this.emitUiMessage(message, socket.id)
	}
	var tryStartResend = function() {
		if (from!=null && to!=null) {
			if (to<0 || to<from) {
				console.log("Nothing to resend for channel "+req.channel)
				socket.emit('no_resend', {channel: req.channel, next: to+1})
			}
			else {
				socket.emit('resending', {channel: req.channel, from:from, to:to})
				_this.kafka.resend(req.channel, from, to, handler, function() {
					console.log("Resend complete! Emitting resent event")
					socket.emit('resent', {channel: req.channel, from:from, to:to})
				})
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

	console.log("subscribe: "+JSON.stringify(request.channel)+", client: "+socket.id)

	this.kafka.subscribe(request.channel, request.from, function(channel, from, err) {
		if (err) {
			socket.emit('subscribed', {
				channel: request.channel, 
				error:err
			})
			console.log("Kafka error joining room "+request.channel+": "+err)
		}
		else socket.join(request.channel, function(err2) {
			if (err2) {
				socket.emit('subscribed', {
					channel: request.channel, 
					error:err
				})
				console.log("socket.io error joining room "+request.channel+": "+err)
			}
			else {
				console.log("Socket "+socket.id+" is now in rooms: "+socket.rooms)
				
				channels.push(request.channel)
				socket.emit('subscribed', {
					channel: request.channel,
					from: from
				})
			}
		})
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

SocketIoServer.prototype.handleUnsubscribeRequest = function(socket, channels, request) {
	var _this = this

	console.log("Client "+socket.id+" unsubscribed from channel "+request.channel)
	socket.leave(request.channel, function(err) {
		// Remove from channels array
		var index = channels.indexOf(request.channel);
		if (index > -1) {
		    channels.splice(index, 1);
		}

		socket.emit('unsubscribed', {channel:request.channel, error:err})
		console.log("Socket "+socket.id+" is now in rooms: "+socket.rooms)
		_this.checkChannelEmpty(request.channel)
	})

}

SocketIoServer.prototype.handleDisconnectRequest = function(socket, channels) {
	var _this = this
	console.log("Client disconnected: "+socket.id+", was on channels: "+channels)

	var unsub = channels.slice() // duplicate the list to avoid modifying it while looping
	// Unsubscribe from all channels
	unsub.forEach(function(channel) {
		_this.handleUnsubscribeRequest(socket, channels, {channel:channel})	
	})
}


exports.SocketIoServer = SocketIoServer