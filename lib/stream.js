'use strict';

var events = require('events')

function Stream(id, partition, state, kafka) {
	this.id = id
	this.partition = partition,
	this.state = state
	this.connectionsById = {}
}

Stream.prototype.__proto__ = events.EventEmitter.prototype;

Stream.prototype.addConnection = function(connection) {
	this.connectionsById[connection.id] = connection
}

Stream.prototype.removeConnection = function(connection) {
	delete this.connectionById[connection.id]
}

Stream.prototype.getConnections = function() {
	return this.connectionsById
}

module.exports = Stream