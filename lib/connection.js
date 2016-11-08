'use strict';

var events = require('events')

function Connection(id, socket) {
	this.id = id
	this.socket = socket
	this.streams = []
}

Connection.prototype.__proto__ = events.EventEmitter.prototype;

Connection.prototype.addStream = function(stream) {
	this.streams.push(stream)
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
