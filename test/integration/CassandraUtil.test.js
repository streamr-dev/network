const assert = require('assert')
const CassandraUtil = require('../../src/CassandraUtil')
const CassandraDataInserter = require('../unit/test-helpers/CassandraDataInserter')

const CASSANDRA_HOST = '127.0.0.1'
const KEYSPACE = 'streamr_dev'
const BULK_INSERT_WAIT_MS = 100

describe('CassandraUtil', () => {
    let allMessages
    let expectedMessages
    let cassandra
    let messagesReceived
    let msgHandler
    let streamId
    let cassandraDataInserter

    function insertedMessagesToStreamMessages() {
        return cassandraDataInserter.insertedMessages.map((binaryMsg) => binaryMsg.toStreamMessage())
    }

    function assertMessages(expectedLastOffsetSent, expectedMsgs, done) {
        return (lastOffsetSent) => {
            assert.equal(lastOffsetSent, expectedLastOffsetSent)
            assert.deepEqual(messagesReceived, expectedMsgs)
            done()
        }
    }

    beforeEach(() => {
        // Unique stream for each test
        streamId = `CassandraUtil.test.js-${Date.now()}`

        messagesReceived = []
        msgHandler = (msg) => {
            messagesReceived.push(msg)
        }

        cassandra = new CassandraUtil([CASSANDRA_HOST], KEYSPACE, {
            maxRefetchRetries: 2,
            refetchInterval: 120,
        })

        cassandraDataInserter = new CassandraDataInserter(cassandra.client, streamId)
        return cassandraDataInserter.bulkInsert(20).then(() => {
            allMessages = insertedMessagesToStreamMessages()
            expectedMessages = allMessages
        })
    })

    afterEach((done) => {
        cassandra.close(done)
    })

    describe('getLast', () => {
        beforeEach(() => {
            expectedMessages = allMessages.slice(15, 20)
        })

        it('produces correct messages when lastKnownOffset === undefined', (done) => {
            cassandra.getLast(streamId, 0, 5, msgHandler, assertMessages(100, expectedMessages, done))
        })

        it('produces no messages when no messages in cassandra', (done) => {
            cassandra.getLast('fake-stream-2', 0, 5, msgHandler, assertMessages(null, [], done), undefined)
        })

        it('produces correct messages when lastKnownOffset < cassandraLastOffset', (done) => {
            cassandra.getLast(streamId, 0, 5, msgHandler, assertMessages(100, expectedMessages, done), 90)
        })

        it('produces correct messages when lastKnownOffset == cassandraLastOffset', (done) => {
            cassandra.getLast(streamId, 0, 5, msgHandler, assertMessages(100, expectedMessages, done), 100)
        })

        it('produces N + pending messages when lastKnownOffset > cassandraLastOffset', (done) => {
            cassandra.getLast(streamId, 0, 5, msgHandler, (lastOffsetSent) => {
                expectedMessages = insertedMessagesToStreamMessages().slice(15, 22)
                assertMessages(110, expectedMessages, done)(lastOffsetSent)
            }, 110)
            cassandraDataInserter.timedBulkInsert(2, BULK_INSERT_WAIT_MS)
        })

        it('eventually gives up if lastKnownOffset never appears', (done) => {
            cassandra.getLast(streamId, 0, 5, msgHandler, assertMessages(100, expectedMessages, done), 110)
        })

        it('emits error if lastKnownOffset never appears', (done) => {
            cassandra.on('maxRefetchAttemptsReached', (data) => {
                assert.deepEqual(Object.keys(data), [
                    'streamId', 'partition', 'targetOffset', 'currentOffset',
                    'msgHandler', 'onDone', 'onMsgEnd', 'refetchCount',
                ])

                assert.equal(data.streamId, streamId)
                assert.equal(data.partition, 0)
                assert.equal(data.targetOffset, 110)
                assert.equal(data.currentOffset, 100)
                assert.equal(data.refetchCount, 2)

                done()
            })
            cassandra.getLast(streamId, 0, 5, msgHandler, () => {}, 110)
        })
    })

    describe('getAll', () => {
        it('produces correct messages when lastKnownOffset === undefined', (done) => {
            cassandra.getAll(streamId, 0, msgHandler, assertMessages(100, expectedMessages, done))
        })

        it('produces correct messages when no messages in cassandra and lastKnownOffset === undefined', (done) => {
            cassandra.getAll('non-existent-stream', 0, msgHandler, assertMessages(null, [], done))
        })

        it('produces correct messages when lastKnownOffset < cassandraLastOffset', (done) => {
            cassandra.getAll(streamId, 0, msgHandler, assertMessages(100, expectedMessages, done), 90)
        })

        it('produces correct messages when lastKnownOffset == cassandraLastOffset', (done) => {
            cassandra.getAll(streamId, 0, msgHandler, assertMessages(100, expectedMessages, done), 100)
        })

        it('produces correct messages when lastKnownOffset > cassandraLastOffset', (done) => {
            cassandra.getAll(streamId, 0, msgHandler, (lastOffsetSent) => {
                expectedMessages = insertedMessagesToStreamMessages()
                assertMessages(110, expectedMessages, done)(lastOffsetSent)
            }, 110)
            cassandraDataInserter.timedBulkInsert(2, BULK_INSERT_WAIT_MS)
        })

        it('eventually gives up if lastKnownOffset never appears', (done) => {
            cassandra.getAll(streamId, 0, msgHandler, assertMessages(100, expectedMessages, done), 110)
        })

        it('emits error if lastKnownOffset never appears', (done) => {
            cassandra.on('maxRefetchAttemptsReached', (data) => {
                assert.deepEqual(Object.keys(data), [
                    'streamId', 'partition', 'targetOffset', 'currentOffset',
                    'msgHandler', 'onDone', 'onMsgEnd', 'refetchCount',
                ])

                assert.equal(data.streamId, streamId)
                assert.equal(data.partition, 0)
                assert.equal(data.targetOffset, 110)
                assert.equal(data.currentOffset, 100)
                assert.equal(data.refetchCount, 2)

                done()
            })
            cassandra.getAll(streamId, 0, msgHandler, () => {}, 110)
        })
    })

    describe('getFromOffset', () => {
        beforeEach(() => {
            expectedMessages = expectedMessages.slice(10, 20)
        })

        it('produces correct messages when lastKnownOffset === undefined', (done) => {
            cassandra.getFromOffset(streamId, 0, 53, msgHandler, assertMessages(100, expectedMessages, done))
        })

        it('produces no messages when no messages found', (done) => {
            cassandra.getFromOffset('fake-stream-2', 0, 53, msgHandler, assertMessages(null, [], done))
        })

        it('produces correct messages when lastKnownOffset < cassandraLastOffset', (done) => {
            cassandra.getFromOffset(streamId, 0, 53, msgHandler, assertMessages(100, expectedMessages, done), 90)
        })

        it('produces correct messages when lastKnownOffset == cassandraLastOffset', (done) => {
            cassandra.getFromOffset(streamId, 0, 53, msgHandler, assertMessages(100, expectedMessages, done), 100)
        })

        it('produces correct messages when lastKnownOffset > cassandraLastOffset', (done) => {
            cassandra.getFromOffset(streamId, 0, 53, msgHandler, (lastOffsetSent) => {
                expectedMessages = insertedMessagesToStreamMessages().slice(10, 22)
                assertMessages(110, expectedMessages, done)(lastOffsetSent)
            }, 110)
            cassandraDataInserter.timedBulkInsert(2, BULK_INSERT_WAIT_MS)
        })

        it('eventually gives up if lastKnownOffset never appears', (done) => {
            cassandra.getFromOffset(streamId, 0, 53, msgHandler, assertMessages(100, expectedMessages, done), 110)
        })

        it('emits error if lastKnownOffset never appears', (done) => {
            cassandra.on('maxRefetchAttemptsReached', (data) => {
                assert.deepEqual(Object.keys(data), [
                    'streamId', 'partition', 'targetOffset', 'currentOffset',
                    'msgHandler', 'onDone', 'onMsgEnd', 'refetchCount',
                ])

                assert.equal(data.streamId, streamId)
                assert.equal(data.partition, 0)
                assert.equal(data.targetOffset, 110)
                assert.equal(data.currentOffset, 100)
                assert.equal(data.refetchCount, 2)

                done()
            })
            cassandra.getFromOffset(streamId, 0, 53, msgHandler, () => {}, 110)
        })
    })

    describe('getOffsetRange', () => {
        beforeEach(() => {
            expectedMessages = expectedMessages.slice(4, 15)
        })

        it('produces correct messages when lastKnownOffset === undefined', (done) => {
            cassandra.getOffsetRange(streamId, 0, 25, 79, msgHandler, assertMessages(75, expectedMessages, done))
        })

        it('produces no messages when no messages found', (done) => {
            cassandra.getOffsetRange('non-existent-stream', 0, 25, 79, msgHandler, assertMessages(null, [], done), undefined)
        })

        it('produces correct messages when lastKnownOffset < min', (done) => {
            cassandra.getOffsetRange(streamId, 0, 25, 79, msgHandler, assertMessages(75, expectedMessages, done), 15)
        })

        it('produces correct messages when min < lastKnownOffset < max', (done) => {
            cassandra.getOffsetRange(streamId, 0, 25, 79, msgHandler, assertMessages(75, expectedMessages, done), 55)
        })

        it('produces correct messages when lastKnownOffset == max', (done) => {
            cassandra.getOffsetRange(streamId, 0, 25, 75, msgHandler, assertMessages(75, expectedMessages, done), 75)
        })

        it('produces correct messages when lastKnownOffset > max', (done) => {
            cassandra.getOffsetRange(streamId, 0, 25, 79, msgHandler, assertMessages(75, expectedMessages, done), 90)
        })

        it('produces correct messages when min < lastKnownOffset < max (incoming data to [min, max] range)', (done) => {
            cassandra.getOffsetRange(streamId, 0, 25, 130, msgHandler, (lastOffsetSent) => {
                expectedMessages = insertedMessagesToStreamMessages().filter((msg) => msg.offset >= 25 && msg.offset <= 110)
                assertMessages(110, expectedMessages, done)(lastOffsetSent)
            }, 110)
            cassandraDataInserter.timedBulkInsert(10, BULK_INSERT_WAIT_MS)
        })

        it('eventually gives up if lastKnownOffset never appears', (done) => {
            expectedMessages = allMessages.slice(4)
            cassandra.getOffsetRange(streamId, 0, 25, 114, msgHandler, assertMessages(100, expectedMessages, done), 105)
        })

        it('emits error if lastKnownOffset never appears', (done) => {
            cassandra.on('maxRefetchAttemptsReached', (data) => {
                assert.deepEqual(Object.keys(data), [
                    'streamId', 'partition', 'targetOffset', 'currentOffset',
                    'msgHandler', 'onDone', 'onMsgEnd', 'refetchCount',
                ])

                assert.equal(data.streamId, streamId)
                assert.equal(data.partition, 0)
                assert.equal(data.targetOffset, 105)
                assert.equal(data.currentOffset, 100)
                assert.equal(data.refetchCount, 2)

                done()
            })
            cassandra.getOffsetRange(streamId, 0, 25, 114, msgHandler, () => {}, 105)
        })

        it('produces empty result when min > max', (done) => {
            cassandra.getOffsetRange(streamId, 0, 15, 5, msgHandler, assertMessages(null, [], done), 100)
        })

        it('produces singleton result when min === max', (done) => {
            expectedMessages = [allMessages[2]]
            cassandra.getOffsetRange(streamId, 0, 15, 15, msgHandler, assertMessages(15, expectedMessages, done), 100)
        })
    })

    describe('getFromTimestamp', () => {
        let startDate

        beforeEach(() => {
            expectedMessages = expectedMessages.slice(10, 20)
            startDate = new Date(1490181060000)
        })

        it('produces correct messages when lastKnownOffset === undefined', (done) => {
            cassandra.getFromTimestamp(streamId, 0, startDate, msgHandler, assertMessages(100, expectedMessages, done))
        })

        it('produces no messages when no messages found', (done) => {
            cassandra.getFromTimestamp('fake-stream-2', 0, startDate, msgHandler, assertMessages(null, [], done), undefined)
        })

        it('produces correct messages when lastKnownOffset < cassandraLastOffset', (done) => {
            cassandra.getFromTimestamp(streamId, 0, startDate, msgHandler, assertMessages(100, expectedMessages, done), 90)
        })

        it('produces correct messages when lastKnownOffset == cassandraLastOffset', (done) => {
            cassandra.getFromTimestamp(streamId, 0, startDate, msgHandler, assertMessages(100, expectedMessages, done), 100)
        })

        it('produces correct messages when lastKnownOffset > cassandraLastOffset', (done) => {
            cassandra.getFromTimestamp(streamId, 0, startDate, msgHandler, (lastOffsetSent) => {
                expectedMessages = insertedMessagesToStreamMessages().filter((msg) => msg.timestamp >= startDate.getTime() && msg.offset <= 110)
                assertMessages(110, expectedMessages, done)(lastOffsetSent)
            }, 110)
            cassandraDataInserter.timedBulkInsert(2, BULK_INSERT_WAIT_MS)
        })

        it('eventually gives up if lastKnownOffset never appears', (done) => {
            cassandra.getFromTimestamp(streamId, 0, startDate, msgHandler, assertMessages(100, expectedMessages, done), 110)
        })

        it('emits error if lastKnownOffset never appears', (done) => {
            cassandra.on('maxRefetchAttemptsReached', (data) => {
                assert.deepEqual(Object.keys(data), [
                    'streamId', 'partition', 'targetOffset', 'currentOffset',
                    'msgHandler', 'onDone', 'onMsgEnd', 'refetchCount',
                ])

                assert.equal(data.streamId, streamId)
                assert.equal(data.partition, 0)
                assert.equal(data.targetOffset, 110)
                assert.equal(data.currentOffset, 100)
                assert.equal(data.refetchCount, 2)

                done()
            })
            cassandra.getFromTimestamp(streamId, 0, startDate, msgHandler, () => {}, 110)
        })
    })

    describe('getTimestampRange', () => {
        let startDate
        let endDate

        beforeEach(() => {
            expectedMessages = expectedMessages.slice(4, 15)
            startDate = new Date(1490180700000) // offset: 25
            endDate = new Date(1490181300000) // offset: 75
        })

        it('produces correct messages when startDate < endDate', (done) => {
            cassandra.getTimestampRange(streamId, 0, startDate, endDate, msgHandler, assertMessages(75, expectedMessages, done))
        })

        it('produces no messages when no messages are found', (done) => {
            cassandra.getTimestampRange('fake-stream-2', 0, startDate, endDate, msgHandler, assertMessages(null, [], done))
        })

        it('produces empty result when min > max', (done) => {
            cassandra.getTimestampRange(streamId, 0, endDate, startDate, msgHandler, assertMessages(null, [], done), 100)
        })

        it('produces singleton result when min === max', (done) => {
            expectedMessages = [allMessages[4]]
            cassandra.getTimestampRange(streamId, 0, startDate, startDate, msgHandler, assertMessages(25, expectedMessages, done), 100)
        })
    })
})
