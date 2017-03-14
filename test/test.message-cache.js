var assert = require('assert')
var sinon = require('sinon')

var constants = require('../lib/constants')
var MessageCache = require('../lib/message-cache')


describe('MessageCache', function () {

	var MIN_SIZE = 10
	var HARD_MAX = 20
	var HINT_TIMEOUT = 60*1000

	var cache
	var resender

	beforeEach(function() {
		resender = {
			resend: sinon.spy()
		}
		cache = new MessageCache('streamId', MIN_SIZE, HARD_MAX, HINT_TIMEOUT, resender)
	})

	function msg(data, counter) {
		data[constants.COUNTER_KEY] = counter
		return data
	}

	describe('add', function() {
		it('must report size correctly after adding messages', function() {
			for (var i=0; i<6; i++)
				cache.add(msg({},i))

			assert.equal(cache.size(), 6)
		})

		it('must not grow larger than the current max size', function() {
			for (var i=0; i<MIN_SIZE+5; i++)
				cache.add(msg({},i))

			assert.equal(cache.size(), MIN_SIZE)
		})

		it('must have good performance for normal rolling', function() {
			var start = Date.now()
			for (var i=0; i<1000000; i++)
				cache.add(msg({},i))

			assert(Date.now() - start < 1000)
		})

		it('must have good performance for larger compactions', function() {
			cache = new MessageCache('streamId', 0, 1000)

			var start = Date.now()

			for (var c=0; c<2000; c++) {
				cache.setMaxSize(1000)
				for (var i=0; i<500; i++)
					cache.add(msg({},i))

				// At end of each filling, set max size to zero, discarding all messages
				cache.setMaxSize(500)
			}

			assert(Date.now() - start < 1000)
		})

		it('must ignore old messages', function() {
			for (var i=0; i<6; i++)
				cache.add(msg({},i))

			cache.add(msg({},0))
			assert.equal(cache.size(), 6)			
		})

		it('must request a resend if a gap is detected', function() {
			for (var i=0; i<6; i++)
				cache.add(msg({},i))

			cache.add(msg({},10))
			assert(resender.resend.calledWith('streamId', 6, 10))			
		})

		it('must not rerequest a resend while resending', function() {
			for (var i=0; i<6; i++)
				cache.add(msg({},i))

			cache.add(msg({},10))
			cache.add(msg({},11))
			assert(resender.resend.calledOnce)			
		})

		it('must add the resent messages to the cache', function() {
			resender.resend = function(topic, fromOffset, toOffset, handler, cb) {
				assert(cache.resending)

				for (var i=fromOffset; i<=toOffset; i++) {
					handler(msg({}, i))
					cb()
				}
			}

			for (var i=0; i<6; i++)
				cache.add(msg({},i))

			cache.add(msg({},8))
			assert.equal(cache.size(),9)
			assert(!cache.resending)
		})


	})

	describe('getLast', function() {
		it('must return the requested number of items', function() {
			for (var i=0; i<5; i++)
				cache.add(msg({},i))

			assert.equal(cache.getLast(3).length, 3)
		})

		it('must return null if the cache does not contain the requested number of items', function() {
			for (var i=0; i<5; i++)
				cache.add(msg({},i))

			assert.equal(cache.getLast(10), null)
		})

		it('must return the correct items in correct order', function() {
			for (var i=0; i<5; i++)
				cache.add(msg({},i))

			var list = cache.getLast(3)
			for (var i=0; i<3; i++)
				assert.equal(list[i][constants.COUNTER_KEY], i+2)
		})

		it('must hint the cache about its size', function() {
			cache.hint = sinon.spy()
			cache.getLast(10)
			assert(cache.hint.calledWith(10))
		})
	})

	describe('getRange', function() {
		it('must return the correct items in correct order', function() {
			for (var i=0; i<5; i++)
				cache.add(msg({},i))

			var list = cache.getRange(1,3)
			for (var i=0; i<3; i++)
				assert.equal(list[i][constants.COUNTER_KEY], i+1)
		})

		it('must return a single item if requested', function() {
			for (var i=0; i<5; i++)
				cache.add(msg({},i))

			var list = cache.getRange(3,3)
			assert.equal(list[0][constants.COUNTER_KEY], 3)
		})

		it('must return all items if necessary', function() {
			for (var i=0; i<5; i++)
				cache.add(msg({},i))

			var list = cache.getRange(0,4)
			for (var i=0; i<5; i++)
				assert.equal(list[i][constants.COUNTER_KEY], i)
		})

		it('must return items till the end if to is not specified', function() {
			for (var i=0; i<5; i++)
				cache.add(msg({},i))

			var list = cache.getRange(2)
			for (var i=0; i<3; i++)
				assert.equal(list[i][constants.COUNTER_KEY], i+2)
		})

		it('must return null if to>from', function() {
			for (var i=0; i<5; i++)
				cache.add(msg({},i))

			assert.equal(cache.getRange(3,2), null)
		})

		it('must return null if the cache does not contain the requested number of items', function() {
			for (var i=0; i<5; i++)
				cache.add(msg({},i))

			assert.equal(cache.getRange(4,5), null)
		})

		it('must hint the cache about its size', function() {
			cache.hint = sinon.spy()
			cache.getRange(15,25)
			assert(cache.hint.calledWith(11))
		})

		it('must not hint the cache if range params are invalid', function() {
			cache.hint = sinon.spy()
			cache.getRange(25,0)
			assert(cache.hint.notCalled)
		})
	})

	describe('setMaxSize', function() {
		it('must compact the cache when shrinking', function() {
			for (var i=0; i<10; i++)
				cache.add(msg({},i))

			cache.setMaxSize(5)
			assert.equal(cache.size(), 5)
		})

		it('must never grow beyond the hard max', function() {
			cache.setMaxSize(HARD_MAX+10)
			for (var i=0; i<HARD_MAX+10; i++)
				cache.add(msg({},i))
			assert.equal(cache.size(), HARD_MAX)
		})
	})

	describe('hint', function() {

		var clock

		beforeEach(function() {
			clock = sinon.useFakeTimers()
		})

		afterEach(function() {
			clock.restore()
		})

		it('must grow the cache max size to the hinted value', function() {
			cache.hint(15)

			for (var i=0; i<20; i++)
				cache.add(msg({},i))

			assert.equal(cache.size(), 15)
		})

		it('must reset to min size after timeout', function() {
			cache.hint(MIN_SIZE + 10)

			for (var i=0; i<MIN_SIZE+10; i++)
				cache.add(msg({},i))

			assert(cache.size() > MIN_SIZE)

			clock.tick(HINT_TIMEOUT)

			assert.equal(cache.size(), MIN_SIZE)
		})

		it('must reset the timer on new hint', function() {
			cache.hint(MIN_SIZE + 10)

			for (var i=0; i<MIN_SIZE+10; i++)
				cache.add(msg({},i))

			assert(cache.size() > MIN_SIZE)

			// Not yet timed out
			clock.tick(HINT_TIMEOUT - 1000)
			// Not yet compacted
			assert.equal(cache.size(), MIN_SIZE+10)
			// New hint
			cache.hint(MIN_SIZE + 10)
			// Time passes over original timeout
			clock.tick(HINT_TIMEOUT - 1000)
			// Not yet compacted
			assert.equal(cache.size(), MIN_SIZE+10)
			// Time passes over new timeout
			clock.tick(1000)
			// Compacted!
			assert.equal(cache.size(), MIN_SIZE)
		})

		it('must reset to next-best hinted size on timeout', function() {
			cache.hint(MIN_SIZE + 10)

			for (var i=0; i<MIN_SIZE+10; i++)
				cache.add(msg({},i))

			// Not yet timed out
			clock.tick(HINT_TIMEOUT - 1000)
			// Not yet compacted
			assert.equal(cache.size(), MIN_SIZE+10)

			// New hint at smaller size
			cache.hint(MIN_SIZE + 1)
			// Time passes to original timeout
			clock.tick(1000)
			// Must be compacted to next-best hint
			assert.equal(cache.size(), MIN_SIZE + 1)
		})

		it('must ignore hints smaller than the current next-best hint', function() {
			cache.hint(MIN_SIZE + 10)

			for (var i=0; i<MIN_SIZE+10; i++)
				cache.add(msg({},i))

			// Tick a bit forward
			clock.tick(1000)

			// New hint at smaller size
			cache.hint(MIN_SIZE + 1)
			// Another hint at even smaller size
			cache.hint(MIN_SIZE + 2)

			// Time passes to original timeout
			clock.tick(HINT_TIMEOUT-1000)

			// Must be compacted to next-best hint
			assert.equal(cache.size(), MIN_SIZE + 2)
			assert.equal(cache.nextHint, MIN_SIZE + 2)
			// Next-best should expire at this point
			clock.tick(1000)
			assert.equal(cache.nextHint, undefined)
			
			clock.tick(HINT_TIMEOUT)
			assert.equal(cache.size(), MIN_SIZE)
		})
	})
})
