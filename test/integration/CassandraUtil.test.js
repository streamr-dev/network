const assert = require('assert')
const CassandraUtil = require('../../src/CassandraUtil')
const CassandraDataInserter = require('../unit/test-helpers/CassandraDataInserter')

const CASSANDRA_HOST = '127.0.0.1'
const KEYSPACE = 'streamr_dev'
const BULK_INSERT_WAIT_MS = 100

// don't put arrow function here, mocha timeout can only be set this way
describe('CassandraUtil', function () {
    this.timeout(30 * 1000)

    let allMessages
    let expectedMessages
    let cassandra
    let messagesReceived
    let msgHandler
    let cassandraDataInserter

    before(() => {
        cassandra = new CassandraUtil([CASSANDRA_HOST], KEYSPACE, {
            maxRefetchRetries: 2,
            refetchInterval: 120,
        })

        cassandraDataInserter = new CassandraDataInserter(cassandra.client)
        return cassandraDataInserter.deleteData().then(() => cassandraDataInserter.bulkInsert(20)).then((res) => {
            console.log('Data inserted!')
        }).catch((err) => {
            throw new Error(err)
        })
    })

    beforeEach(() => {
        allMessages = [
            [28, 'fake-stream-1', 0, 1490180460000, 10, 5, -1, 27, JSON.stringify({
                key: 'msg-1',
            })],
            [28, 'fake-stream-1', 0, 1490180520000, 10, 10, 5, 27, JSON.stringify({
                key: 'msg-2',
            })],
            [28, 'fake-stream-1', 0, 1490180580000, 10, 15, 10, 27, JSON.stringify({
                key: 'msg-3',
            })],
            [28, 'fake-stream-1', 0, 1490180640000, 10, 20, 15, 27, JSON.stringify({
                key: 'msg-4',
            })],
            [28, 'fake-stream-1', 0, 1490180700000, 10, 25, 20, 27, JSON.stringify({
                key: 'msg-5',
            })],
            [28, 'fake-stream-1', 0, 1490180760000, 10, 30, 25, 27, JSON.stringify({
                key: 'msg-6',
            })],
            [28, 'fake-stream-1', 0, 1490180820000, 10, 35, 30, 27, JSON.stringify({
                key: 'msg-7',
            })],
            [28, 'fake-stream-1', 0, 1490180880000, 10, 40, 35, 27, JSON.stringify({
                key: 'msg-8',
            })],
            [28, 'fake-stream-1', 0, 1490180940000, 10, 45, 40, 27, JSON.stringify({
                key: 'msg-9',
            })],
            [28, 'fake-stream-1', 0, 1490181000000, 10, 50, 45, 27, JSON.stringify({
                key: 'msg-10',
            })],
            [28, 'fake-stream-1', 0, 1490181060000, 10, 55, 50, 27, JSON.stringify({
                key: 'msg-11',
            })],
            [28, 'fake-stream-1', 0, 1490181120000, 10, 60, 55, 27, JSON.stringify({
                key: 'msg-12',
            })],
            [28, 'fake-stream-1', 0, 1490181180000, 10, 65, 60, 27, JSON.stringify({
                key: 'msg-13',
            })],
            [28, 'fake-stream-1', 0, 1490181240000, 10, 70, 65, 27, JSON.stringify({
                key: 'msg-14',
            })],
            [28, 'fake-stream-1', 0, 1490181300000, 10, 75, 70, 27, JSON.stringify({
                key: 'msg-15',
            })],
            [28, 'fake-stream-1', 0, 1490181360000, 10, 80, 75, 27, JSON.stringify({
                key: 'msg-16',
            })],
            [28, 'fake-stream-1', 0, 1490181420000, 10, 85, 80, 27, JSON.stringify({
                key: 'msg-17',
            })],
            [28, 'fake-stream-1', 0, 1490181480000, 10, 90, 85, 27, JSON.stringify({
                key: 'msg-18',
            })],
            [28, 'fake-stream-1', 0, 1490181540000, 10, 95, 90, 27, JSON.stringify({
                key: 'msg-19',
            })],
            [28, 'fake-stream-1', 0, 1490181600000, 10, 100, 95, 27, JSON.stringify({
                key: 'msg-20',
            })],
        ]
        expectedMessages = allMessages

        messagesReceived = []
        msgHandler = (msg) => {
            messagesReceived.push(msg.toArray())
        }
    })

    after(() => cassandraDataInserter.deleteData().then(() => {
        cassandra.close()
    }))

    function assertion(expectedLastOffsetSent, expectedMsgs, done) {
        return (lastOffsetSent) => {
            assert.equal(lastOffsetSent, expectedLastOffsetSent)
            assert.deepEqual(messagesReceived, expectedMsgs)
            done()
        }
    }

    describe('getLast', () => {
        beforeEach(() => {
            expectedMessages = expectedMessages.slice(15, 20)
        })

        it('produces correct messages when lastKnownOffset === undefined', (done) => {
            cassandra.getLast('fake-stream-1', 0, 5, msgHandler, assertion(100, expectedMessages, done))
        })

        it('produces no messages when no messages in cassandra', (done) => {
            cassandra.getLast('fake-stream-2', 0, 5, msgHandler, assertion(null, [], done), undefined)
        })

        it('produces correct messages when lastKnownOffset < cassandraLastOffset', (done) => {
            cassandra.getLast('fake-stream-1', 0, 5, msgHandler, assertion(100, expectedMessages, done), 90)
        })

        it('produces correct messages when lastKnownOffset == cassandraLastOffset', (done) => {
            cassandra.getLast('fake-stream-1', 0, 5, msgHandler, assertion(100, expectedMessages, done), 100)
        })

        it('produces correct messages when lastKnownOffset > cassandraLastOffset', (done) => {
            expectedMessages = expectedMessages.concat([
                [28, 'fake-stream-1', 0, 1490181660000, 10, 105, 100, 27, JSON.stringify({
                    key: 'msg-21',
                })],
                [28, 'fake-stream-1', 0, 1490181720000, 10, 110, 105, 27, JSON.stringify({
                    key: 'msg-22',
                })],
            ])
            cassandra.getLast('fake-stream-1', 0, 5, msgHandler, assertion(110, expectedMessages, done), 110)
            cassandraDataInserter.timedBulkInsert(2, BULK_INSERT_WAIT_MS)
        })

        it('eventually gives up if lastKnownOffset never appears', (done) => {
            cassandra.getLast('fake-stream-1', 0, 5, msgHandler, assertion(100, expectedMessages, done), 110)
        })

        it('emits error if lastKnownOffset never appears', (done) => {
            cassandra.on('maxRefetchAttemptsReached', (data) => {
                assert.deepEqual(Object.keys(data), [
                    'streamId', 'partition', 'targetOffset', 'currentOffset',
                    'msgHandler', 'onDone', 'onMsgEnd', 'refetchCount',
                ])

                assert.equal(data.streamId, 'fake-stream-1')
                assert.equal(data.partition, 0)
                assert.equal(data.targetOffset, 110)
                assert.equal(data.currentOffset, 100)
                assert.equal(data.refetchCount, 2)

                done()
            })
            cassandra.getLast('fake-stream-1', 0, 5, msgHandler, () => {}, 110)
        })
    })

    describe('getAll', () => {
        it('produces correct messages when lastKnownOffset === undefined', (done) => {
            cassandra.getAll('fake-stream-1', 0, msgHandler, assertion(100, expectedMessages, done))
        })

        it('produces correct messages when no messages in cassandra and lastKnownOffset === undefined', (done) => {
            cassandraDataInserter.deleteData().then(() => {
                cassandra.getAll('fake-stream-1', 0, msgHandler, assertion(null, [], done))
            })
        })

        it('produces correct messages when lastKnownOffset < cassandraLastOffset', (done) => {
            cassandra.getAll('fake-stream-1', 0, msgHandler, assertion(100, expectedMessages, done), 90)
        })

        it('produces correct messages when lastKnownOffset == cassandraLastOffset', (done) => {
            cassandra.getAll('fake-stream-1', 0, msgHandler, assertion(100, expectedMessages, done), 100)
        })

        it('produces correct messages when lastKnownOffset > cassandraLastOffset', (done) => {
            expectedMessages = expectedMessages.concat([
                [28, 'fake-stream-1', 0, 1490181660000, 10, 105, 100, 27, JSON.stringify({
                    key: 'msg-21',
                })],
                [28, 'fake-stream-1', 0, 1490181720000, 10, 110, 105, 27, JSON.stringify({
                    key: 'msg-22',
                })],
            ])
            cassandra.getAll('fake-stream-1', 0, msgHandler, assertion(110, expectedMessages, done), 110)
            cassandraDataInserter.timedBulkInsert(2, BULK_INSERT_WAIT_MS)
        })

        it('eventually gives up if lastKnownOffset never appears', (done) => {
            cassandra.getAll('fake-stream-1', 0, msgHandler, assertion(100, expectedMessages, done), 110)
        })

        it('emits error if lastKnownOffset never appears', (done) => {
            cassandra.on('maxRefetchAttemptsReached', (data) => {
                assert.deepEqual(Object.keys(data), [
                    'streamId', 'partition', 'targetOffset', 'currentOffset',
                    'msgHandler', 'onDone', 'onMsgEnd', 'refetchCount',
                ])

                assert.equal(data.streamId, 'fake-stream-1')
                assert.equal(data.partition, 0)
                assert.equal(data.targetOffset, 110)
                assert.equal(data.currentOffset, 100)
                assert.equal(data.refetchCount, 2)

                done()
            })
            cassandra.getAll('fake-stream-1', 0, msgHandler, () => {}, 110)
        })
    })

    describe('getFromOffset', () => {
        beforeEach(() => {
            expectedMessages = expectedMessages.slice(10, 20)
        })

        it('produces correct messages when lastKnownOffset === undefined', (done) => {
            cassandra.getFromOffset('fake-stream-1', 0, 53, msgHandler, assertion(100, expectedMessages, done))
        })

        it('produces no messages when no messages found', (done) => {
            cassandra.getFromOffset('fake-stream-2', 0, 53, msgHandler, assertion(null, [], done))
        })

        it('produces correct messages when lastKnownOffset < cassandraLastOffset', (done) => {
            cassandra.getFromOffset('fake-stream-1', 0, 53, msgHandler, assertion(100, expectedMessages, done), 90)
        })

        it('produces correct messages when lastKnownOffset == cassandraLastOffset', (done) => {
            cassandra.getFromOffset('fake-stream-1', 0, 53, msgHandler, assertion(100, expectedMessages, done), 100)
        })

        it('produces correct messages when lastKnownOffset > cassandraLastOffset', (done) => {
            expectedMessages = expectedMessages.concat([
                [28, 'fake-stream-1', 0, 1490181660000, 10, 105, 100, 27, JSON.stringify({
                    key: 'msg-21',
                })],
                [28, 'fake-stream-1', 0, 1490181720000, 10, 110, 105, 27, JSON.stringify({
                    key: 'msg-22',
                })],
            ])
            cassandra.getFromOffset('fake-stream-1', 0, 53, msgHandler, assertion(110, expectedMessages, done), 110)
            cassandraDataInserter.timedBulkInsert(2, BULK_INSERT_WAIT_MS)
        })

        it('eventually gives up if lastKnownOffset never appears', (done) => {
            cassandra.getFromOffset('fake-stream-1', 0, 53, msgHandler, assertion(100, expectedMessages, done), 110)
        })

        it('emits error if lastKnownOffset never appears', (done) => {
            cassandra.on('maxRefetchAttemptsReached', (data) => {
                assert.deepEqual(Object.keys(data), [
                    'streamId', 'partition', 'targetOffset', 'currentOffset',
                    'msgHandler', 'onDone', 'onMsgEnd', 'refetchCount',
                ])

                assert.equal(data.streamId, 'fake-stream-1')
                assert.equal(data.partition, 0)
                assert.equal(data.targetOffset, 110)
                assert.equal(data.currentOffset, 100)
                assert.equal(data.refetchCount, 2)

                done()
            })
            cassandra.getFromOffset('fake-stream-1', 0, 53, msgHandler, () => {}, 110)
        })
    })

    describe('getOffsetRange', () => {
        beforeEach(() => {
            expectedMessages = expectedMessages.slice(4, 15)
        })

        it('produces correct messages when lastKnownOffset === undefined', (done) => {
            cassandra.getOffsetRange('fake-stream-1', 0, 25, 79, msgHandler, assertion(75, expectedMessages, done))
        })

        it('produces no messages when no messages found', (done) => {
            cassandra.getOffsetRange('fake-stream-1', 0, 25, 79, msgHandler, assertion(null, [], done), undefined)
        })

        it('produces correct messages when lastKnownOffset < min', (done) => {
            cassandra.getOffsetRange('fake-stream-1', 0, 25, 79, msgHandler, assertion(75, expectedMessages, done), 15)
        })

        it('produces correct messages when min < lastKnownOffset < max', (done) => {
            cassandra.getOffsetRange('fake-stream-1', 0, 25, 79, msgHandler, assertion(75, expectedMessages, done), 55)
        })

        it('produces correct messages when lastKnownOffset == max', (done) => {
            cassandra.getOffsetRange('fake-stream-1', 0, 25, 75, msgHandler, assertion(75, expectedMessages, done), 75)
        })

        it('produces correct messages when lastKnownOffset > max', (done) => {
            cassandra.getOffsetRange('fake-stream-1', 0, 25, 79, msgHandler, assertion(75, expectedMessages, done), 90)
        })

        it('produces correct messages when min < lastKnownOffset < max (incoming data to [min, max] range)', (done) => {
            expectedMessages = allMessages.slice(4).concat([
                [28, 'fake-stream-1', 0, 1490181660000, 10, 105, 100, 27, JSON.stringify({
                    key: 'msg-21',
                })],
                [28, 'fake-stream-1', 0, 1490181720000, 10, 110, 105, 27, JSON.stringify({
                    key: 'msg-22',
                })],
            ])
            cassandra.getOffsetRange('fake-stream-1', 0, 25, 130, msgHandler, assertion(110, expectedMessages, done), 110)
            cassandraDataInserter.timedBulkInsert(10, BULK_INSERT_WAIT_MS)
        })

        it('eventually gives up if lastKnownOffset never appears', (done) => {
            expectedMessages = allMessages.slice(4)
            cassandra.getOffsetRange('fake-stream-1', 0, 25, 114, msgHandler, assertion(100, expectedMessages, done), 105)
        })

        it('emits error if lastKnownOffset never appears', (done) => {
            cassandra.on('maxRefetchAttemptsReached', (data) => {
                assert.deepEqual(Object.keys(data), [
                    'streamId', 'partition', 'targetOffset', 'currentOffset',
                    'msgHandler', 'onDone', 'onMsgEnd', 'refetchCount',
                ])

                assert.equal(data.streamId, 'fake-stream-1')
                assert.equal(data.partition, 0)
                assert.equal(data.targetOffset, 105)
                assert.equal(data.currentOffset, 100)
                assert.equal(data.refetchCount, 2)

                done()
            })
            cassandra.getOffsetRange('fake-stream-1', 0, 25, 114, msgHandler, () => {}, 105)
        })

        it('produces empty result when min > max', (done) => {
            cassandra.getOffsetRange('fake-stream-1', 0, 15, 5, msgHandler, assertion(null, [], done), 100)
        })

        it('produces singleton result when min === max', (done) => {
            expectedMessages = [allMessages[2]]
            cassandra.getOffsetRange('fake-stream-1', 0, 15, 15, msgHandler, assertion(15, expectedMessages, done), 100)
        })
    })

    describe('getFromTimestamp', () => {
        let startDate

        beforeEach(() => {
            expectedMessages = expectedMessages.slice(10, 20)
            startDate = new Date(1490181060000)
        })

        it('produces correct messages when lastKnownOffset === undefined', (done) => {
            cassandra.getFromTimestamp('fake-stream-1', 0, startDate, msgHandler, assertion(100, expectedMessages, done))
        })

        it('produces no messages when no messages found', (done) => {
            cassandra.getFromTimestamp('fake-stream-2', 0, startDate, msgHandler, assertion(null, [], done), undefined)
        })

        it('produces correct messages when lastKnownOffset < cassandraLastOffset', (done) => {
            cassandra.getFromTimestamp('fake-stream-1', 0, startDate, msgHandler, assertion(100, expectedMessages, done), 90)
        })

        it('produces correct messages when lastKnownOffset == cassandraLastOffset', (done) => {
            cassandra.getFromTimestamp('fake-stream-1', 0, startDate, msgHandler, assertion(100, expectedMessages, done), 100)
        })

        it('produces correct messages when lastKnownOffset > cassandraLastOffset', (done) => {
            expectedMessages = expectedMessages.concat([
                [28, 'fake-stream-1', 0, 1490181660000, 10, 105, 100, 27, JSON.stringify({
                    key: 'msg-21',
                })],
                [28, 'fake-stream-1', 0, 1490181720000, 10, 110, 105, 27, JSON.stringify({
                    key: 'msg-22',
                })],
            ])
            cassandra.getFromTimestamp('fake-stream-1', 0, startDate, msgHandler, assertion(110, expectedMessages, done), 110)
            cassandraDataInserter.timedBulkInsert(2, BULK_INSERT_WAIT_MS)
        })

        it('eventually gives up if lastKnownOffset never appears', (done) => {
            cassandra.getFromTimestamp('fake-stream-1', 0, startDate, msgHandler, assertion(100, expectedMessages, done), 110)
        })

        it('emits error if lastKnownOffset never appears', (done) => {
            cassandra.on('maxRefetchAttemptsReached', (data) => {
                assert.deepEqual(Object.keys(data), [
                    'streamId', 'partition', 'targetOffset', 'currentOffset',
                    'msgHandler', 'onDone', 'onMsgEnd', 'refetchCount',
                ])

                assert.equal(data.streamId, 'fake-stream-1')
                assert.equal(data.partition, 0)
                assert.equal(data.targetOffset, 110)
                assert.equal(data.currentOffset, 100)
                assert.equal(data.refetchCount, 2)

                done()
            })
            cassandra.getFromTimestamp('fake-stream-1', 0, startDate, msgHandler, () => {}, 110)
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
            cassandra.getTimestampRange('fake-stream-1', 0, startDate, endDate, msgHandler, assertion(75, expectedMessages, done))
        })

        it('produces no messages when no messages are found', (done) => {
            cassandra.getTimestampRange('fake-stream-2', 0, startDate, endDate, msgHandler, assertion(null, [], done))
        })

        it('produces empty result when min > max', (done) => {
            cassandra.getTimestampRange('fake-stream-1', 0, endDate, startDate, msgHandler, assertion(null, [], done), 100)
        })

        it('produces singleton result when min === max', (done) => {
            expectedMessages = [allMessages[4]]
            cassandra.getTimestampRange('fake-stream-1', 0, startDate, startDate, msgHandler, assertion(25, expectedMessages, done), 100)
        })
    })
})
