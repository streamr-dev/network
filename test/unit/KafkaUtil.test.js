const assert = require('assert')
const sinon = require('sinon')
const KafkaUtil = require('../../src/KafkaUtil')

describe('KafkaUtil', () => {
    const dataTopic = 'dataTopic'

    let kafkaUtil
    let mockKafkaClient
    let mockKafkaProducer
    let mockZookeeper
    let mockPartitioner

    let streamrBinaryMessage

    beforeEach(() => {
        mockKafkaClient = {
            topicMetadata: {
                dataTopic: {},
            },
            refreshMetadata: sinon.mock().yields(undefined),
            on: sinon.spy(),
        }
        mockKafkaProducer = {
            on: sinon.spy(),
        }
        mockZookeeper = {}
        mockPartitioner = {
            partition: sinon.stub().returns(5),
        }

        streamrBinaryMessage = {
            streamId: 'streamId',
            streamPartition: 0,
            toBytes: sinon.stub().returns('bytes'),
        }

        kafkaUtil = new KafkaUtil(dataTopic, mockPartitioner, mockZookeeper, mockKafkaClient, mockKafkaProducer)
    })

    it('should send an encoded message to the data topic with partitioning provided by the partitioner', (done) => {
        kafkaUtil.kafkaProducer = {
            send(arr) {
                assert.equal(arr.length, 1)
                assert.equal(arr[0].topic, dataTopic)
                assert(mockPartitioner.partition.calledWith(
                    kafkaUtil.dataTopicPartitionCount,
                    `${streamrBinaryMessage.streamId}-${streamrBinaryMessage.streamPartition}`,
                ))
                assert.equal(arr[0].partition, 5)
                assert.equal(arr[0].messages, 'bytes')
                assert(streamrBinaryMessage.toBytes.calledOnce)
                done()
            },
        }

        kafkaUtil.send(streamrBinaryMessage)
    })

    it('should call the callback with no arguments on successful produce', (done) => {
        kafkaUtil.kafkaProducer = {
            send(arr, cb) {
                cb()
            },
        }

        kafkaUtil.send(streamrBinaryMessage, (err) => {
            assert(!err)
            done()
        })
    })

    it('should call the callback with the error on unsuccessful produce', (done) => {
        kafkaUtil.kafkaProducer = {
            send(arr, cb) {
                cb('test error')
            },
        }

        kafkaUtil.send(streamrBinaryMessage, (err) => {
            assert.equal(err, 'test error')
            done()
        })
    })

    it('should register error handlers for kafka client and producer', () => {
        mockKafkaClient.on.calledWith('error')
        mockKafkaProducer.on.calledWith('error')
    })
})
