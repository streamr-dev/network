"use strict"

var kafka = require('kafka-node')
var events = require('events')
var debug = require('debug')('StreamrKafkaProducer')

function StreamrKafkaProducer(dataTopic, partitioner, zookeeper, kafkaClient, kafkaProducer) {
	var _this = this

	this.dataTopic = dataTopic
	this.partitioner = partitioner
	this.kafkaClient = kafkaClient || new kafka.Client(zookeeper, "streamr-kafka-producer-"+Date.now())

	this.kafkaClient.on('ready', function() {
		debug("Kafka client is ready. Refreshing metadata for data topic: %s", _this.dataTopic)
		_this.kafkaClient.refreshMetadata([dataTopic], function(err) {
			if (err) {
				throw "Error while getting metadata for data topic "+_this.dataTopic+": "+err
			} else if (!_this.kafkaClient.topicMetadata[_this.dataTopic]) {
				throw "Falsey topic metadata for "+_this.dataTopic+": "+_this.kafkaClient.topicMetadata[_this.dataTopic]
			}

			_this.dataTopicPartitionCount = Object.keys(_this.kafkaClient.topicMetadata[_this.dataTopic]).length
			debug("Got metadata for data topic: %o", _this.kafkaClient.topicMetadata[_this.dataTopic])
			debug("Partition count is: %d", _this.dataTopicPartitionCount)
			_this.emit('ready')
		})
	})

	this.kafkaProducer = kafkaProducer || new kafka.HighLevelProducer(this.kafkaClient)

	this.kafkaClient.on('error', function(err) {
		throw err
	})

	this.kafkaProducer.on('error', function(err) {
		throw err
	})
}

StreamrKafkaProducer.prototype.__proto__ = events.EventEmitter.prototype;

StreamrKafkaProducer.prototype.send = function(streamrBinaryMessage, cb) {
	var produceRequest = {
		topic: this.dataTopic,
		// Directly set the partition using our custom partitioner for consistency with Java (KafkaService.CustomPartitioner)
		partition: this.partitioner.partition(this.dataTopicPartitionCount, streamrBinaryMessage.streamId+"-"+streamrBinaryMessage.streamPartition),
		messages: streamrBinaryMessage.toBytes()
	}

	debug("Kafka produce request: %o", produceRequest)

	this.kafkaProducer.send([produceRequest], function(err) {
		debug("Kafka producer send callback err: ", err)

		if (err) {
			console.log("Error producing to Kafka: ", err)
		}
		if (cb) {
			cb(err)
		}
	})
}

module.exports = StreamrKafkaProducer