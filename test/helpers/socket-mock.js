'use strict'

const events = require('events')

module.exports = function () {
	var socket = new events.EventEmitter()

	socket.rooms = []
	socket.sentMessages = []

	socket.join = function(channel, cb) {
		socket.rooms.push(channel)
		console.log("SOCKET MOCK: Socket "+socket.id+" joined channel "+channel+", now on: "+socket.rooms)
		if (!wsMock.sockets.adapter.rooms[channel]) {
			wsMock.sockets.adapter.rooms[channel] = {}
			wsMock.sockets.adapter.rooms[channel][socket.id] = socket
		}
		cb()
	}

	socket.receive = function(message) {
		socket.emit('message', JSON.stringify(message))
	}

	socket.send = function(message) {
		socket.sentMessages.push(message)
	}

	socket.disconnect = function() {
		socket.emit('close')
	}

	socket.leave = function(channel, cb) {
		var index = socket.rooms.indexOf(channel)
		if (index>=0) {
			socket.rooms.splice(index, 1)
		}

		delete wsMock.sockets.adapter.rooms[channel][socket.id]
		console.log("SOCKET MOCK: Socket "+socket.id+" left channel "+channel+", now on: "+socket.rooms)
		cb()
	}

	return socket
}