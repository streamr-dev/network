'use strict';

var events = require('events')

function Stream(id, partition, state) {
	this.id = id
	this.partition = partition
	this.state = state
}

Stream.prototype.__proto__ = events.EventEmitter.prototype;

module.exports = Stream