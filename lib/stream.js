'use strict';

var events = require('events')
var MessageCache = require('./message-cache')

function Stream(id, state) {
	this.id = id
	this.state = state
	this.cache = new MessageCache()
}

Stream.prototype.__proto__ = events.EventEmitter.prototype;

module.exports = Stream