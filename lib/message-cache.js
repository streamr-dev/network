'use strict';

var debug = require('debug')('MessageCache')
var debugMessages = require('debug')('MessageCache:messages')

var constants = require('./constants')

function MessageCache(streamId, minSize, hardMax, hintTimeout, resender) {
	this.streamId = streamId
	this.minSize = (minSize===undefined ? 0 : minSize)
	this.hardMax = (hardMax===undefined ? 100 : hardMax)
	this.messages = []
	this.hintTimeout = 60*1000
	this.hintTimeouts = {}

	// Start at minimum size
	this.setMaxSize(this.minSize)

	this.resender = resender
}

MessageCache.prototype.add = function(msg) {
	var _this = this
	if (this.maxSize > 0) {
		// Ensure no gaps
		if (this.messages.length===0 || this.messages[this.messages.length-1][constants.COUNTER_KEY] === msg[constants.COUNTER_KEY]-1) {
			this.messages.push(msg)
			this.compact()
			debugMessages("add: %o", msg)
		}
		else if (this.messages.length>0 && this.messages[this.messages.length-1][constants.COUNTER_KEY] < msg[constants.COUNTER_KEY]-1 && !this.resending) {
			debug("Oh, no! Cache detected a gap in counters for stream %s! Latest in cache: %d, new message: %d", this.streamId, this.messages[this.messages.length-1][constants.COUNTER_KEY], msg[constants.COUNTER_KEY])
			this.resending = true
			this.resender.resend(
				this.streamId, 
				this.messages[this.messages.length-1][constants.COUNTER_KEY]+1, // from counter
				msg[constants.COUNTER_KEY], // to counter
				// handler
				function(resentMessage) {
					_this.add(resentMessage)
				},
				// finish callback
				function() {
					_this.resending = false
				})
		}
		else {
			// ignore old messages
		}
	}
}

MessageCache.prototype.compact = function() {
	// Optimize the case when we are rolling and there is just one extra msg
	if (this.messages.length===this.maxSize+1)
		this.messages.shift()
	// Larger compaction on eg. max size change
	else if (this.messages.length > this.maxSize) {
		this.messages.splice(0, this.messages.length - this.maxSize)
	}
}

MessageCache.prototype.getLast = function(count) {
	this.hint(count)

	if (count > this.messages.length) {
		debug("getLast: Cache MISS for %s, count: %d", this.streamId, count)
		return null
	}
	else {
		debug("getLast: Cache HIT for %s, count: %d", this.streamId, count)
		return this.messages.slice(-1*count)
	}
}

MessageCache.prototype.getRange = function(from, to) {
	if (to===undefined)
		to = (this.messages.length>0 ? this.messages[this.messages.length-1][constants.COUNTER_KEY] : -1)

	if (to<from)
		return null

	this.hint(to-from+1)

	if (this.messages.length >= to-from+1 && this.messages[this.messages.length-1][constants.COUNTER_KEY] >= to && this.messages[0][constants.COUNTER_KEY] <= from) {
		debug("getRange: Cache HIT for %s, range: %d to %d", this.streamId, from, to)
		return this.messages.slice(from - this.messages[0][constants.COUNTER_KEY], to - this.messages[0][constants.COUNTER_KEY] + 1)
	}
	else {
		debug("getRange: Cache MISS for %s, range: %d to %d", this.streamId, from, to)
		return null
	}
}

MessageCache.prototype.hint = function(size) {
	var _this = this

	// Hint can only grow the maxSize
	if (size > this.maxSize) {
		this.setMaxSize(size)
		debug("hint: Cache size for %s grown to %d", this.streamId, this.maxSize)
	}

	if (size>=this.maxSize) {
		var checkCurrent = function() {
			if (_this.nextHint !== undefined) {
				debug("hint: Current size expired for %s, resising from %d to next-largest size %d", _this.streamId, _this.maxSize, _this.nextHint)
				_this.setMaxSize(_this.nextHint)

				// New timeout for next step
				_this.setHintTimeout('curr', checkCurrent)
			}
			else {
				debug("hint: Current size expired for %s, resising from %d to minimum size %d", _this.streamId, _this.maxSize, _this.minSize)
				_this.setMaxSize(_this.minSize)
				// No new timeout, since at minSize
			}
		}
		this.setHintTimeout('curr', checkCurrent)
	}
	else if (!this.nextHint || size >= this.nextHint) {
		this.nextHint = size

		this.setHintTimeout('next', function() {
			debug("hint: Next-largest size expired for %s, was %d (current size is %d)", _this.streamId, _this.nextHint, _this.maxSize)
			delete _this.nextHint
		})
	}
}

MessageCache.prototype.setHintTimeout = function(id, cb) {
	if (this.hintTimeouts[id])
		clearTimeout(this.hintTimeouts[id])

	// Timeout will shrink the maxSize	
	this.hintTimeouts[id] = setTimeout(cb, this.hintTimeout)
}

MessageCache.prototype.setMaxSize = function(maxSize) {
	var oldMaxSize = this.maxSize
	this.maxSize = Math.min(maxSize, this.hardMax)

	if (this.maxSize < oldMaxSize)
		this.compact()
}

MessageCache.prototype.size = function() {
	return this.messages.length
}

module.exports = MessageCache
