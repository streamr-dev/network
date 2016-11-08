'use strict';

var events = require('events')
var protocol = require('./protocol')

function Connection(id, socket) {
	this.id = id
	this.socket = socket
	this.streams = []
}

Connection.prototype.__proto__ = events.EventEmitter.prototype;

Connection.prototype.sendRaw = function(buf) {
	this.socket.send(buf)
}

Connection.prototype.sendSubscribed = function(response) {
	this.socket.send(protocol.encodeForBrowser(protocol.BROWSER_MSG_TYPE_SUBSCRIBED, response))
}

Connection.prototype.sendUnsubscribed = function(response) {
	this.socket.send(protocol.encodeForBrowser(protocol.BROWSER_MSG_TYPE_UNSUBSCRIBED), response)
}

Connection.prototype.sendResending = function(response) {
	this.socket.send(protocol.encodeForBrowser(protocol.BROWSER_MSG_TYPE_RESENDING), response)
}

Connection.prototype.sendResent = function(response) {
	this.socket.send(protocol.encodeForBrowser(protocol.BROWSER_MSG_TYPE_RESENT), response)
}

Connection.prototype.sendNoResend = function(response) {
	this.socket.send(protocol.encodeForBrowser(protocol.BROWSER_MSG_TYPE_NO_RESEND), response)
}

Connection.prototype.sendError = function(response) {
	this.socket.send(protocol.encodeForBrowser(protocol.BROWSER_MSG_TYPE_ERROR, response))
}

Connection.prototype.sendUnicast = function(msg, subId) {
	this.socket.send(protocol.encodeForBrowser(protocol.BROWSER_MSG_TYPE_UNICAST, msg, subId))
}

Connection.prototype.sendBroadcast = function(msg) {
	this.socket.send(protocol.encodeForBrowser(protocol.BROWSER_MSG_TYPE_BROADCAST, msg))
}

Connection.prototype.addStream = function(stream) {
	this.streams.push(stream)
}

Connection.prototype.addRoom = function(room) {
	this.rooms.push(room)
}

Connection.prototype.removeStream = function(streamId, streamPartition) {
	var i
	for (i=0; i<this.streams.length; i++) {
		if (this.streams[i].id === streamId && this.streams[i].partition === streamPartition) {
			break
		}
	}
	if (i < this.streams.length) {
	    this.streams.splice(i, 1);
	}
}

Connection.prototype.getStreams = function() {
	// Return a copy
	return this.streams.slice()
}

module.exports = Connection
