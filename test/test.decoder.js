var assert = require('assert'),
	decoder = require('../lib/decoder'),
	BufferMaker = require('buffermaker')

describe('decoder', function () {

	it('should return the message as is if it is not a raw buffer', function() {
		var msg = {foo: "bar"}
		assert(msg === decoder.decode(msg).message)
	})

	it('should return buffers as json-parsed strings if no version or format is set', function() {
		var msg = new Buffer('{"foo": "bar"}')
		assert.equal(decoder.decode(msg).message.foo, JSON.parse(msg).foo)
	})

	it('should return as is if could not parse as json', function() {
		var msg = new Buffer('')
		assert(msg === decoder.decode(msg).message)
	})

	it('should parse UnifinaKafkaProducer JSON messages from raw buffers', function () {
		var msg = {foo: "bar"}
		var buf = new BufferMaker()
                        .Int8(27) // version
                        .Int64BE(Date.now())
                        .Int8(27) // format (JSON)
                        .string(JSON.stringify(msg))
                        .make();
		var result = decoder.decode(buf)
		assert.equal(result.message.foo, msg.foo)
	});

	it('should add a timestamp key to the message if requested', function() {
		var msg = {foo: "bar"}
		var date = Date.now()
		var buf = new BufferMaker()
                        .Int8(27) // version
                        .Int64BE(date)
                        .Int8(27) // format (JSON)
                        .string(JSON.stringify(msg))
                        .make();
		var result = decoder.decode(buf)
		assert.equal(result.message.foo, msg.foo)
		assert.equal(result.timestamp, date)
	})

});