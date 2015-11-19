'use strict';

var events = require('events')

function Connection(id, socket) {
	this.id = id
	this.socket = socket
	this.rooms = []
}

Connection.prototype.__proto__ = events.EventEmitter.prototype;

Connection.prototype.addRoom = function(room) {
	this.rooms.push(room)
}

Connection.prototype.removeRoom = function(room) {
	var index = this.rooms.indexOf(room);
	if (index > -1) {
	    this.rooms.splice(index, 1);
	}
}

Connection.prototype.getRooms = function() {
	// Return a copy
	return this.rooms.slice()
}

module.exports = Connection
