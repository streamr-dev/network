'use strict';

var events = require('events')
var MessageCache = require('./message-cache')

function Stream(id, state, kafka) {
	this.id = id
	this.state = state

	// use default values for the undefined args
	this.cache = new MessageCache(id, undefined, undefined, undefined, kafka)
}

Stream.prototype.__proto__ = events.EventEmitter.prototype;

module.exports = Stream