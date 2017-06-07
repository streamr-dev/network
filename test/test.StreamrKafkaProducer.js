const assert = require('assert'),
	sinon = require('sinon'),
	StreamrKafkaProducer = require('../lib/StreamrKafkaProducer'),
	events = require('events')

describe('producer', function () {

	var producer
	var kafkaClient
	var kafkaProducer
	var zookeeper
	var partitioner

	var dataTopic = "dataTopic"

	var streamrBinaryMessage

	beforeEach(function() {
		kafkaClient = {
			topicMetadata: {
				dataTopic: {}
			},
			refreshMetadata: sinon.mock().yields(undefined),
			on: sinon.spy()
		}
		kafkaProducer = {
			on: sinon.spy()
		}
		zookeeper = {

		}
		partitioner = {
			partition: sinon.stub().returns(5)
		}

		streamrBinaryMessage = {
			streamId: 'streamId',
			streamPartition: 0,
			toBytes: sinon.stub().returns('bytes')
		}

		producer = new StreamrKafkaProducer(dataTopic, partitioner, zookeeper, kafkaClient, kafkaProducer)

		timestamp = Date.now()
	});

	it('should send an encoded message to the data topic with partitioning provided by the partitioner', function (done) {
		producer.kafkaProducer = {
			send: function(arr, cb) {
				assert.equal(arr.length, 1)
				assert.equal(arr[0].topic, dataTopic)
				assert(partitioner.partition.calledWith(producer.dataTopicPartitionCount, streamrBinaryMessage.streamId+"-"+streamrBinaryMessage.streamPartition))
				assert.equal(arr[0].partition, 5)
				assert.equal(arr[0].messages, "bytes")
				assert(streamrBinaryMessage.toBytes.calledOnce)
				done()
			}
		}

		producer.send(streamrBinaryMessage)
	});

	it('should call the callback with no arguments on successful produce', function (done) {
		producer.kafkaProducer = {
			send: function(arr, cb) {
				cb()
			}
		}

		producer.send(streamrBinaryMessage, function(err) {
			assert(!err)
			done()
		})
	});

	it('should call the callback with the error on unsuccessful produce', function (done) {
		producer.kafkaProducer = {
			send: function(arr, cb) {
				cb("test error")
			}
		}

		producer.send(streamrBinaryMessage, function(err) {
			assert.equal(err, "test error")
			done()
		})
	});

	it('should register error handlers for kafka client and producer', function() {
		kafkaClient.on.calledWith('error')
		kafkaProducer.on.calledWith('error')
	})

});