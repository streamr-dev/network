'use strict';

var events = require('events')

function Stream(id, partition, state) {
	this.id = id
	this.partition = partition
	this.state = state
	this.connections = []
}

Stream.prototype.__proto__ = events.EventEmitter.prototype;

Stream.prototype.addConnection = function(connection) {
	this.connections.push(connection)
}

Stream.prototype.removeConnection = function(connection) {
	// slow, but makes the common case (getConnections) fast
	var index = this.connections.indexOf(connection);
	if (index > -1) {
		this.connections.splice(index, 1);
	}
}

Stream.prototype.getConnections = function() {
	return this.connections
}

module.exports = Stream