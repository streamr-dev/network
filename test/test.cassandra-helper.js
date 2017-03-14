const assert = require('assert')
const CassandraHelper = require('../lib/cassandra-helper')
const CassandraDataInserter = require('./helpers/cassandra-data-inserter')

const CASSANDRA_HOST = '127.0.0.1'
const KEYSPACE = 'streamr_dev'

describe('CassandraHelper', function() {
	var allMessages
	var expectedMessages
	var cassandraHelper
	var messagesReceived
	var msgHandler
	var cassandraDataInserter

	beforeEach(function() {
		expectedMessages = allMessages = [
			[28, "fake-stream-1", 0, 1490180460000, 10, 5, -1,  27, { "key": "msg-1" }],
			[28, "fake-stream-1", 0, 1490180520000, 10, 10, 5,  27, { "key": "msg-2" }],
			[28, "fake-stream-1", 0, 1490180580000, 10, 15, 10,  27, { "key": "msg-3" }],
			[28, "fake-stream-1", 0, 1490180640000, 10, 20, 15,  27, { "key": "msg-4" }],
			[28, "fake-stream-1", 0, 1490180700000, 10, 25, 20,  27, { "key": "msg-5" }],
			[28, "fake-stream-1", 0, 1490180760000, 10, 30, 25,  27, { "key": "msg-6" }],
			[28, "fake-stream-1", 0, 1490180820000, 10, 35, 30,  27, { "key": "msg-7" }],
			[28, "fake-stream-1", 0, 1490180880000, 10, 40, 35,  27, { "key": "msg-8" }],
			[28, "fake-stream-1", 0, 1490180940000, 10, 45, 40,  27, { "key": "msg-9" }],
			[28, "fake-stream-1", 0, 1490181000000, 10, 50, 45,  27, { "key": "msg-10" }],
			[28, "fake-stream-1", 0, 1490181060000, 10, 55, 50,  27, { "key": "msg-11" }],
			[28, "fake-stream-1", 0, 1490181120000, 10, 60, 55,  27, { "key": "msg-12" }],
			[28, "fake-stream-1", 0, 1490181180000, 10, 65, 60,  27, { "key": "msg-13" }],
			[28, "fake-stream-1", 0, 1490181240000, 10, 70, 65,  27, { "key": "msg-14" }],
			[28, "fake-stream-1", 0, 1490181300000, 10, 75, 70,  27, { "key": "msg-15" }],
			[28, "fake-stream-1", 0, 1490181360000, 10, 80, 75,  27, { "key": "msg-16" }],
			[28, "fake-stream-1", 0, 1490181420000, 10, 85, 80,  27, { "key": "msg-17" }],
			[28, "fake-stream-1", 0, 1490181480000, 10, 90, 85,  27, { "key": "msg-18" }],
			[28, "fake-stream-1", 0, 1490181540000, 10, 95, 90,  27, { "key": "msg-19" }],
			[28, "fake-stream-1", 0, 1490181600000, 10, 100, 95, 27, { "key": "msg-20" }]
		]

		cassandraHelper = new CassandraHelper([CASSANDRA_HOST], KEYSPACE, {
			maxRefetchRetries: 2,
			refetchInterval: 250
		})
		messagesReceived = []
		msgHandler = messagesReceived.push.bind(messagesReceived)
		cassandraDataInserter = new CassandraDataInserter(CASSANDRA_HOST, KEYSPACE)
		return cassandraDataInserter.bulkInsert(20)
	})

	afterEach(function() {
		return cassandraDataInserter.clearAndClose()
	})

	function assertion(expectedLastOffsetSent, expectedMessages, done) {
		return function(lastOffsetSent) {
			assert.equal(lastOffsetSent, expectedLastOffsetSent)
			assert.deepEqual(messagesReceived, expectedMessages)
			done()
		}
	}

	describe("getLast", function() {
		beforeEach(function() {
			expectedMessages = expectedMessages.slice(15, 20)
		})

		it("produces correct messages when lastKnownOffset === undefined", function(done) {
			cassandraHelper.getLast("fake-stream-1", 0, 5, msgHandler, assertion(100, expectedMessages, done))
		})

		it("produces correct messages when no messages in cassandra and lastKnownOffset === undefined", function(done) {
			cassandraDataInserter.clearAndClose()
			cassandraHelper.getLast("fake-stream-1", 0, 5, msgHandler, assertion(null, [], done))
		})

		it("produces correct messages when lastKnownOffset < cassandraLastOffset", function(done) {
			cassandraHelper.getLast("fake-stream-1", 0, 5, msgHandler, assertion(100, expectedMessages, done), 90)
		})

		it("produces correct messages when lastKnownOffset == cassandraLastOffset", function(done) {
			cassandraHelper.getLast("fake-stream-1", 0, 5, msgHandler, assertion(100, expectedMessages, done), 100)
		})

		it("produces correct messages when lastKnownOffset > cassandraLastOffset", function(done) {
			 expectedMessages = expectedMessages.concat([
				[28, "fake-stream-1", 0, 1490181660000, 10, 105, 100, 27, { "key": "msg-21" }],
				[28, "fake-stream-1", 0, 1490181720000, 10, 110, 105, 27, { "key": "msg-22" }]
			])
			cassandraHelper.getLast("fake-stream-1", 0, 5, msgHandler, assertion(110, expectedMessages, done), 110)
			cassandraDataInserter.timedBulkInsert(2, 200)
		})

		it("eventually gives up if lastKnownOffset never appears", function(done) {
			cassandraHelper.getLast("fake-stream-1", 0, 5, msgHandler, assertion(100, expectedMessages, done), 110)
		})

		it("emits error if lastKnownOffset never appears", function(done) {
			cassandraHelper.on("maxRefetchAttemptsReached", function(data) {
				assert.deepEqual(Object.keys(data), [
					"streamId", "partition", "targetOffset", "currentOffset",
					"msgHandler", "onDone", "onMsgEnd", "refetchCount"
				])

				assert.equal(data.streamId, "fake-stream-1")
				assert.equal(data.partition, 0)
				assert.equal(data.targetOffset, 110)
				assert.equal(data.currentOffset, 100)
				assert.equal(data.refetchCount, 2)

				done()
			})
			cassandraHelper.getLast("fake-stream-1", 0, 5, msgHandler, function(){}, 110)
		})
	})

	describe("getAll", function () {
		it("produces correct messages when lastKnownOffset === undefined", function(done) {
			cassandraHelper.getAll("fake-stream-1", 0, msgHandler, assertion(100, expectedMessages, done))
		})

		it("produces correct messages when no messages in cassandra and lastKnownOffset === undefined", function(done) {
			cassandraDataInserter.clearAndClose()
			cassandraHelper.getAll("fake-stream-1", 0, msgHandler, assertion(null, [], done))
		})

		it("produces correct messages when lastKnownOffset < cassandraLastOffset", function(done) {
			cassandraHelper.getAll("fake-stream-1", 0, msgHandler, assertion(100, expectedMessages, done), 90)
		})

		it("produces correct messages when lastKnownOffset == cassandraLastOffset", function(done) {
			cassandraHelper.getAll("fake-stream-1", 0, msgHandler, assertion(100, expectedMessages, done), 100)
		})

		it("produces correct messages when lastKnownOffset > cassandraLastOffset", function(done) {
			expectedMessages = expectedMessages.concat([
				[28, "fake-stream-1", 0, 1490181660000, 10, 105, 100, 27, { "key": "msg-21" }],
				[28, "fake-stream-1", 0, 1490181720000, 10, 110, 105, 27, { "key": "msg-22" }]
			])
			cassandraHelper.getAll("fake-stream-1", 0, msgHandler, assertion(110, expectedMessages, done), 110)
			cassandraDataInserter.timedBulkInsert(2, 200)
		})

		it("eventually gives up if lastKnownOffset never appears", function(done) {
			cassandraHelper.getAll("fake-stream-1", 0, msgHandler, assertion(100, expectedMessages, done), 110)
		})

		it("emits error if lastKnownOffset never appears", function(done) {
			cassandraHelper.on("maxRefetchAttemptsReached", function(data) {
				assert.deepEqual(Object.keys(data), [
					"streamId", "partition", "targetOffset", "currentOffset",
					"msgHandler", "onDone", "onMsgEnd", "refetchCount"
				])

				assert.equal(data.streamId, "fake-stream-1")
				assert.equal(data.partition, 0)
				assert.equal(data.targetOffset, 110)
				assert.equal(data.currentOffset, 100)
				assert.equal(data.refetchCount, 2)

				done()
			})
			cassandraHelper.getAll("fake-stream-1", 0, msgHandler, function(){}, 110)
		})
	})

	describe("getFromOffset", function () {
		beforeEach(function() {
			expectedMessages = expectedMessages.slice(10, 20)
		})

		it("produces correct messages when lastKnownOffset === undefined", function(done) {
			cassandraHelper.getFromOffset("fake-stream-1", 0, 53, msgHandler, assertion(100, expectedMessages, done))
		})

		it("produces correct messages when no messages in cassandra and lastKnownOffset === undefined", function(done) {
			cassandraDataInserter.clearAndClose()
			cassandraHelper.getFromOffset("fake-stream-1", 0, 53, msgHandler, assertion(null, [], done))
		})

		it("produces correct messages when lastKnownOffset < cassandraLastOffset", function(done) {
			cassandraHelper.getFromOffset("fake-stream-1", 0, 53, msgHandler, assertion(100, expectedMessages, done), 90)
		})

		it("produces correct messages when lastKnownOffset == cassandraLastOffset", function(done) {
			cassandraHelper.getFromOffset("fake-stream-1", 0, 53, msgHandler, assertion(100, expectedMessages, done), 100)
		})

		it("produces correct messages when lastKnownOffset > cassandraLastOffset", function(done) {
			expectedMessages = expectedMessages.concat([
				[28, "fake-stream-1", 0, 1490181660000, 10, 105, 100, 27, { "key": "msg-21" }],
				[28, "fake-stream-1", 0, 1490181720000, 10, 110, 105, 27, { "key": "msg-22" }]
			])
			cassandraHelper.getFromOffset("fake-stream-1", 0, 53, msgHandler, assertion(110, expectedMessages, done), 110)
			cassandraDataInserter.timedBulkInsert(2, 200)
		})

		it("eventually gives up if lastKnownOffset never appears", function(done) {
			cassandraHelper.getFromOffset("fake-stream-1", 0, 53, msgHandler, assertion(100, expectedMessages, done), 110)
		})

		it("emits error if lastKnownOffset never appears", function(done) {
			cassandraHelper.on("maxRefetchAttemptsReached", function(data) {
				assert.deepEqual(Object.keys(data), [
					"streamId", "partition", "targetOffset", "currentOffset",
					"msgHandler", "onDone", "onMsgEnd", "refetchCount"
				])

				assert.equal(data.streamId, "fake-stream-1")
				assert.equal(data.partition, 0)
				assert.equal(data.targetOffset, 110)
				assert.equal(data.currentOffset, 100)
				assert.equal(data.refetchCount, 2)

				done()
			})
			cassandraHelper.getFromOffset("fake-stream-1", 0, 53, msgHandler, function(){}, 110)
		})
	})

	describe("getOffsetRange", function () {
		beforeEach(function() {
			expectedMessages = expectedMessages.slice(4, 15)
		})

		it("produces correct messages when lastKnownOffset === undefined", function(done) {
			cassandraHelper.getOffsetRange("fake-stream-1", 0, 25, 79, msgHandler, assertion(75, expectedMessages, done))
		})

		it("produces correct messages when no messages in cassandra and lastKnownOffset === undefined", function(done) {
			cassandraDataInserter.clearAndClose()
			cassandraHelper.getOffsetRange("fake-stream-1", 0, 25, 79, msgHandler, assertion(null, [], done))
		})

		it("produces correct messages when lastKnownOffset < min", function(done) {
			cassandraHelper.getOffsetRange("fake-stream-1", 0, 25, 79, msgHandler, assertion(75, expectedMessages, done), 15)
		})

		it("produces correct messages when min < lastKnownOffset < max", function(done) {
			cassandraHelper.getOffsetRange("fake-stream-1", 0, 25, 79, msgHandler, assertion(75, expectedMessages, done), 55)
		})

		it("produces correct messages when lastKnownOffset == max", function(done) {
			cassandraHelper.getOffsetRange("fake-stream-1", 0, 25, 75, msgHandler, assertion(75, expectedMessages, done), 75)
		})

		it("produces correct messages when lastKnownOffset > max", function(done) {
			cassandraHelper.getOffsetRange("fake-stream-1", 0, 25, 79, msgHandler, assertion(75, expectedMessages, done), 90)
		})

		it("produces correct messages when min < lastKnownOffset < max (incoming data to [min, max] range)", function(done) {
			expectedMessages = allMessages.slice(4).concat([
				[28, "fake-stream-1", 0, 1490181660000, 10, 105, 100, 27, { "key": "msg-21" }],
				[28, "fake-stream-1", 0, 1490181720000, 10, 110, 105, 27, { "key": "msg-22" }]
			])
			cassandraHelper.getOffsetRange("fake-stream-1", 0, 25, 130, msgHandler, assertion(110, expectedMessages, done), 110)
			cassandraDataInserter.timedBulkInsert(10, 200)
		})

		it("eventually gives up if lastKnownOffset never appears", function(done) {
			expectedMessages = allMessages.slice(4)
			cassandraHelper.getOffsetRange("fake-stream-1", 0, 25, 114, msgHandler, assertion(100, expectedMessages, done), 105)
		})

		it("emits error if lastKnownOffset never appears", function(done) {
			cassandraHelper.on("maxRefetchAttemptsReached", function(data) {
				assert.deepEqual(Object.keys(data), [
					"streamId", "partition", "targetOffset", "currentOffset",
					"msgHandler", "onDone", "onMsgEnd", "refetchCount"
				])

				assert.equal(data.streamId, "fake-stream-1")
				assert.equal(data.partition, 0)
				assert.equal(data.targetOffset, 105)
				assert.equal(data.currentOffset, 100)
				assert.equal(data.refetchCount, 2)

				done()
			})
			cassandraHelper.getOffsetRange("fake-stream-1", 0, 25, 114, msgHandler, function(){}, 105)
		})

		it("produces empty result when min > max", function(done) {
			cassandraHelper.getOffsetRange("fake-stream-1", 0, 15, 5, msgHandler, assertion(null, [], done), 100)
		})

		it("produces singleton result when min === max", function(done) {
			expectedMessages = [ allMessages[2] ]
			cassandraHelper.getOffsetRange("fake-stream-1", 0, 15, 15, msgHandler, assertion(15, expectedMessages, done), 100)
		})
	})

	describe("getFromTimestamp", function () {

		var startDate

		beforeEach(function() {
			expectedMessages = expectedMessages.slice(10, 20)
			startDate = new Date(2017, 2, 22, 13, 11, 0)
		})

		it("produces correct messages when lastKnownOffset === undefined", function(done) {
			cassandraHelper.getFromTimestamp("fake-stream-1", 0, startDate, msgHandler, assertion(100, expectedMessages, done))
		})

		it("produces correct messages when no messages in cassandra and lastKnownOffset === undefined", function(done) {
			cassandraDataInserter.clearAndClose()
			cassandraHelper.getFromTimestamp("fake-stream-1", 0, startDate, msgHandler, assertion(null, [], done))
		})

		it("produces correct messages when lastKnownOffset < cassandraLastOffset", function(done) {
			cassandraHelper.getFromTimestamp("fake-stream-1", 0, startDate, msgHandler, assertion(100, expectedMessages, done), 90)
		})

		it("produces correct messages when lastKnownOffset == cassandraLastOffset", function(done) {
			cassandraHelper.getFromTimestamp("fake-stream-1", 0, startDate, msgHandler, assertion(100, expectedMessages, done), 100)
		})

		it("produces correct messages when lastKnownOffset > cassandraLastOffset", function(done) {
			expectedMessages = expectedMessages.concat([
				[28, "fake-stream-1", 0, 1490181660000, 10, 105, 100, 27, { "key": "msg-21" }],
				[28, "fake-stream-1", 0, 1490181720000, 10, 110, 105, 27, { "key": "msg-22" }]
			])
			cassandraHelper.getFromTimestamp("fake-stream-1", 0, startDate, msgHandler, assertion(110, expectedMessages, done), 110)
			cassandraDataInserter.timedBulkInsert(2, 200)
		})

		it("eventually gives up if lastKnownOffset never appears", function(done) {
			cassandraHelper.getFromTimestamp("fake-stream-1", 0, startDate, msgHandler, assertion(100, expectedMessages, done), 110)
		})

		it("emits error if lastKnownOffset never appears", function(done) {
			cassandraHelper.on("maxRefetchAttemptsReached", function(data) {
				assert.deepEqual(Object.keys(data), [
					"streamId", "partition", "targetOffset", "currentOffset",
					"msgHandler", "onDone", "onMsgEnd", "refetchCount"
				])

				assert.equal(data.streamId, "fake-stream-1")
				assert.equal(data.partition, 0)
				assert.equal(data.targetOffset, 110)
				assert.equal(data.currentOffset, 100)
				assert.equal(data.refetchCount, 2)

				done()
			})
			cassandraHelper.getFromTimestamp("fake-stream-1", 0, startDate, msgHandler, function(){}, 110)
		})
	})

	describe("getTimestampRange", function () {

		var startDate
		var endDate
		var longInFuture

		beforeEach(function() {
			expectedMessages = expectedMessages.slice(4, 15)
			startDate = new Date(2017, 2, 22, 13, 5, 0)				// offset: 25
			endDate = new Date(2017, 2, 22, 13, 15, 45)				// offset: 75
			longInFuture = new Date(2017, 2, 22, 19, 0, 0)
		})

		it("produces correct messages when startDate < endDate", function(done) {
			cassandraHelper.getTimestampRange("fake-stream-1", 0, startDate, endDate, msgHandler, assertion(75, expectedMessages, done))
		})

		it("produces no messages when startDate < endDate but Cassandra empty", function(done) {
			cassandraDataInserter.clearAndClose()
			cassandraHelper.getTimestampRange("fake-stream-1", 0, startDate, endDate, msgHandler, assertion(null, [], done))
		})

		it("produces empty result when min > max", function(done) {
			cassandraHelper.getTimestampRange("fake-stream-1", 0, endDate, startDate, msgHandler, assertion(null, [], done), 100)
		})

		it("produces singleton result when min === max", function(done) {
			expectedMessages = [ allMessages[4] ]
			cassandraHelper.getTimestampRange("fake-stream-1", 0, startDate, startDate, msgHandler, assertion(25, expectedMessages, done), 100)
		})
	})
})