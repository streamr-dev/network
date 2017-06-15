const assert = require('assert')
const sinon = require('sinon')
const StreamrBinaryMessage = require('../lib/protocol/StreamrBinaryMessage')
const StreamrBinaryMessageWithKafkaMetadata = require('../lib/protocol/StreamrBinaryMessageWithKafkaMetadata')

describe('StreamrBinaryMessageWithKafkaMetadata', function () {

	describe('version 0', function() {

		let msg
		let msgWithMetadata

		before(function() {
			sinon.test = require('sinon-test').configureTest(sinon)
		})

		beforeEach(function() {
			const streamId = "streamId"
			const streamPartition = 0
			const timestamp = 1497529459457
			const ttl = 100
			const content = new Buffer('{"foo":"bar"}', 'utf8')
			const offset = 100
			const previousOffset = 99
			const kafkaPartition = 0

			msg = new StreamrBinaryMessage(
				streamId,
				streamPartition,
				timestamp,
				ttl,
				StreamrBinaryMessage.CONTENT_TYPE_JSON,
				content
			)

			msgWithMetadata = new StreamrBinaryMessageWithKafkaMetadata(msg, offset, previousOffset, kafkaPartition)
		})

		describe('toBytes/fromBytes', function() {

			it('encodes/decodes message fields properly', function() {
				const msgAsBytes = msgWithMetadata.toBytes()
				const rebuiltMsg = StreamrBinaryMessageWithKafkaMetadata.fromBytes(msgAsBytes)

				assert.equal(rebuiltMsg.version, 0)
				assert.equal(rebuiltMsg.offset, 100)
				assert.equal(rebuiltMsg.previousOffset, 99)
			})

			it('support undefined previousOffset', function() {
				const msgAsBytes = new StreamrBinaryMessageWithKafkaMetadata(msg, 100, undefined, 0).toBytes()
				const rebuiltMsg = StreamrBinaryMessageWithKafkaMetadata.fromBytes(msgAsBytes)

				assert.equal(rebuiltMsg.previousOffset, undefined)
			})

			it('keeps wrapped StreamrBinaryMessage untouched', function() {
				const msgAsBytes = msgWithMetadata.toBytes()
				const rebuiltMsg = StreamrBinaryMessageWithKafkaMetadata.fromBytes(msgAsBytes).getStreamrBinaryMessage()

				assert.deepEqual(rebuiltMsg, msg)
			})

			it('does not call StreamrBinaryMessage.fromBytes() when StreamrBinaryMessage passed as buffer', function() {
				// sinon.test() sandbox removes the spy when done
				sinon.test(function() {
					this.spy(StreamrBinaryMessage, "fromBytes")

					const msgAsBytes = new StreamrBinaryMessageWithKafkaMetadata(msg.toBytes(), 100, 99, 0).toBytes()
					StreamrBinaryMessageWithKafkaMetadata.fromBytes(msgAsBytes).getStreamrBinaryMessage()

					assert.equal(StreamrBinaryMessage.fromBytes.callCount, 0)
				})
			})
		})

		describe('toArray(contentAsBuffer)', function() {
			it('returns data in array format given contentAsBuffer=true', function() {
				assert.deepEqual(msgWithMetadata.toArray(true), [
					28,
					"streamId",
					0,
					1497529459457,
					100,
					100,
					99,
					StreamrBinaryMessage.CONTENT_TYPE_JSON,
					'{"foo":"bar"}'
				])
			})

			it('returns data in array format with pre-parsed content contentAsBuffer=false', function() {
				assert.deepEqual(msgWithMetadata.toArray(false), [
					28,
					"streamId",
					0,
					1497529459457,
					100,
					100,
					99,
					StreamrBinaryMessage.CONTENT_TYPE_JSON,
					{ foo: "bar" }
				])
			})
		})

		describe('toObject(contentAsBuffer)', function() {
			it('returns data in object format given contentAsBuffer=true', function() {
				assert.deepEqual(msgWithMetadata.toObject(true), {
					version: 28,
					streamId: "streamId",
					partition: 0,
					timestamp: 1497529459457,
					ttl: 100,
					offset: 100,
					previousOffset: 99,
					contentType: StreamrBinaryMessage.CONTENT_TYPE_JSON,
					content: '{"foo":"bar"}'
				})
			})

			it('returns data in object format with pre-parsed content contentAsBuffer=false', function() {
				assert.deepEqual(msgWithMetadata.toObject(false), {
					version: 28,
					streamId: "streamId",
					partition: 0,
					timestamp: 1497529459457,
					ttl: 100,
					offset: 100,
					previousOffset: 99,
					contentType: StreamrBinaryMessage.CONTENT_TYPE_JSON,
					content: { foo: "bar" }
				})
			})
		})

	})

});
