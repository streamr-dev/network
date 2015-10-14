'use strict';

function MessageCache(minSize, hardMax, hintTimeout) {
	this.minSize = (minSize===undefined ? 0 : minSize)
	this.hardMax = (hardMax===undefined ? 100 : hardMax)
	this.messages = []
	this.hintTimeout = 60*1000
	this.hintTimeouts = {}

	// Start at minimum size
	this.setMaxSize(this.minSize)
}

MessageCache.prototype.add = function(msg) {
	if (this.maxSize > 0)
		this.messages.push(msg)

	this.compact()
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

MessageCache.prototype.get = function(count) {
	if (count > this.messages.length)
		return null
	else {
		return this.messages.slice(-1*count)
	}
}

MessageCache.prototype.hint = function(size) {
	var _this = this

	// Hint can only grow the maxSize
	if (size > this.maxSize) {
		this.setMaxSize(size)
	}

	if (size>=this.maxSize) {
		var checkCurrent = function() {
			if (_this.nextHint !== undefined) {
				_this.setMaxSize(_this.nextHint)

				// New timeout for next step
				_this.setHintTimeout('curr', checkCurrent)
			}
			else {
				_this.setMaxSize(_this.minSize)
				// No new timeout, since at minSize
			}
		}
		this.setHintTimeout('curr', checkCurrent)
	}
	else if (!this.nextHint || size >= this.nextHint) {
		this.nextHint = size

		this.setHintTimeout('next', function() {
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
