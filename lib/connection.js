'use strict';

const events = require('events')
const encoder = require('./message-encoder')

function Connection(id, socket) {
	this.id = id
	this.socket = socket
	this.streams = []
}

Connection.prototype.__proto__ = events.EventEmitter.prototype

Connection.prototype.addStream = function(stream) {
	this.streams.push(stream)
}

Connection.prototype.removeStream = function(streamId, streamPartition) {
	var i
	for (i=0; i < this.streams.length; i++) {
		if (this.streams[i].id === streamId && this.streams[i].partition === streamPartition) {
			break
		}
	}
	if (i < this.streams.length) {
		this.streams.splice(i, 1)
	}
}

Connection.prototype.getStreams = function() {
	return this.streams.slice() // return copy
}

Connection.prototype.sendRaw = function(buf) {
	this.socket.send(buf)
}

Connection.prototype.sendSubscribed = function(response) {
	this.socket.send(encoder.subscribedMessage(response))
}

Connection.prototype.sendUnsubscribed = function(response) {
	this.socket.send(encoder.unsubscribedMessage(response))
}

Connection.prototype.sendResending = function(response) {
	this.socket.send(encoder.resendingMessage(response))
}

Connection.prototype.sendResent = function(response) {
	this.socket.send(encoder.resentMessage(response))
}

Connection.prototype.sendNoResend = function(response) {
	this.socket.send(encoder.noResendMessage(response))
}

Connection.prototype.sendError = function(response) {
	this.socket.send(encoder.errorMessage(response))
}

Connection.prototype.sendUnicast = function(msg, subId) {
	this.socket.send(encoder.unicastMessage(msg, subId))
}

module.exports = Connection
