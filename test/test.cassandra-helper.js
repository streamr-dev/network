var assert = require('assert')
const cassandra = require('cassandra-driver')
var CassandraHelper = require('../lib/cassandra-helper')
var StreamrBinaryMessage = require('../lib/protocol/StreamrBinaryMessage')
var StreamrBinaryMessageWithKafkaMetadata = require('../lib/protocol/StreamrBinaryMessageWithKafkaMetadata')


const CASSANDRA_HOST = '127.0.0.1'
const KEYSPACE = 'streamr_dev'


/* Utility for inserting typical stream events to Cassandra */
function insertData(cassandraClient, index, prevOffset) {
	var streamId = "fake-stream-1"
	var partition = 0
	var timestamp = new Date(2017, 2, 22, 13, index, 0)
	var ttl = 10
	var contentType = StreamrBinaryMessage.CONTENT_TYPE_JSON
	var content = { key: "msg-" + index}
	var offset = index * 5
	var msg = new StreamrBinaryMessage(streamId, partition, timestamp, ttl, contentType, content)

	var promises = []
	promises.push(cassandraClient.execute("INSERT INTO stream_events" +
		"(stream, stream_partition, kafka_partition, kafka_offset, previous_offset, ts, payload)" +
		" VALUES (?, ?, ?, ?, ?, ?, ?) USING TTL ?",
		[streamId, partition, 0, offset, prevOffset, timestamp, msg.toBytes(), ttl], { prepare: true }))
	promises.push(cassandraClient.execute("INSERT INTO stream_timestamps" +
		" (stream, stream_partition, kafka_offset, ts)" +
		" VALUES (?, ?, ?, ?) USING TTL ?", [streamId, partition, offset, timestamp, ttl], { prepare: true }))

	return { offset: offset, promises: promises}
}


describe('CassandraHelper', function() {
	var cassandraClient
	var cassandraHelper
	var msgHandler

	var prevOffset
	var index
	var msgHandlerReceived

	beforeEach(function() {
		cassandraHelper = new CassandraHelper([CASSANDRA_HOST], KEYSPACE)

		msgHandlerReceived = []
		msgHandler = function(msg) {
			msgHandlerReceived.push(msg)
		}


		// Produce data to Cassandra
		cassandraClient = new cassandra.Client({ contactPoints: [CASSANDRA_HOST], keyspace: KEYSPACE })

		prevOffset = -1
		index = 1
		var promises = []
		while (index <= 50) {
			var result = insertData(cassandraClient, index++, prevOffset)
			promises.push.apply(promises, result.promises)
			prevOffset = result.offset
		}
		return Promise.all(promises)
	})

	afterEach(function(done) {
		// Tear down data from Cassandra and close
		Promise.all([
			cassandraClient.execute("DELETE FROM stream_timestamps WHERE stream = 'fake-stream-1' AND stream_partition = 0"),
			cassandraClient.execute("DELETE FROM stream_events WHERE stream = 'fake-stream-1' AND stream_partition = 0")
		]).then(function() {
			cassandraClient.shutdown()
			done()
		}).catch(function(e) {
			done(e)
		})
	})

	describe("getLast", function() {
		it("returns correct offset without lastKnownOffset", function(done) {
			const onDone = function() {
				assert.deepEqual(msgHandlerReceived, [
					[28, "fake-stream-1", 0, 1490183160000, 10, 230, 225, 27, { "key": "msg-46" }],
					[28, "fake-stream-1", 0, 1490183220000, 10, 235, 230, 27, { "key": "msg-47" }],
					[28, "fake-stream-1", 0, 1490183280000, 10, 240, 235, 27, { "key": "msg-48" }],
					[28, "fake-stream-1", 0, 1490183340000, 10, 245, 240, 27, { "key": "msg-49" }],
					[28, "fake-stream-1", 0, 1490183400000, 10, 250, 245, 27, { "key": "msg-50" }]
				])
				done()
			}
			cassandraHelper.getLast("fake-stream-1", 0, 5, msgHandler, onDone)
		})

		it("returns correct offset with lastKnownOffset < cassandraLastOffset", function(done) {
			const onDone = function() {
				assert.deepEqual(msgHandlerReceived, [
					[28, "fake-stream-1", 0, 1490183160000, 10, 230, 225, 27, { "key": "msg-46" }],
					[28, "fake-stream-1", 0, 1490183220000, 10, 235, 230, 27, { "key": "msg-47" }],
					[28, "fake-stream-1", 0, 1490183280000, 10, 240, 235, 27, { "key": "msg-48" }],
					[28, "fake-stream-1", 0, 1490183340000, 10, 245, 240, 27, { "key": "msg-49" }],
					[28, "fake-stream-1", 0, 1490183400000, 10, 250, 245, 27, { "key": "msg-50" }]
				])
				done()
			}
			cassandraHelper.getLast("fake-stream-1", 0, 5, msgHandler, onDone, 200)
		})

		it("returns correct offset with lastKnownOffset > cassandraLastOffset", function(done) {
			var dataPushed = false

			const onDone = function() {
				assert.equal(dataPushed, true)
				assert.deepEqual(msgHandlerReceived, [
					[28, "fake-stream-1", 0, 1490183160000, 10, 230, 225, 27, { "key": "msg-46" }],
					[28, "fake-stream-1", 0, 1490183220000, 10, 235, 230, 27, { "key": "msg-47" }],
					[28, "fake-stream-1", 0, 1490183280000, 10, 240, 235, 27, { "key": "msg-48" }],
					[28, "fake-stream-1", 0, 1490183340000, 10, 245, 240, 27, { "key": "msg-49" }],
					[28, "fake-stream-1", 0, 1490183400000, 10, 250, 245, 27, { "key": "msg-50" }],
					[28, "fake-stream-1", 0, 1490183460000, 10, 255, 250, 27, { "key": "msg-51" }],
					[28, "fake-stream-1", 0, 1490183520000, 10, 260, 255, 27, { "key": "msg-52" }]
				])
				done()
			}
			cassandraHelper.getLast("fake-stream-1", 0, 5, msgHandler, onDone, 260)

			setTimeout(function() {
				var promises = []
				while (index <= 52) {
					var result = insertData(cassandraClient, index++, prevOffset)
					promises.push.apply(promises, result.promises)
					prevOffset = result.offset
				}
				Promise.all(promises).then(function() {
					dataPushed = true
				}).catch(function(e) {
					console.error(e)
				})
			}, 200)
		})
	})
})