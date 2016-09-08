'use strict';

var events = require('events')

function Stream(id, state, kafka) {
	this.id = id
	this.state = state
}

Stream.prototype.__proto__ = events.EventEmitter.prototype;

module.exports = Stream