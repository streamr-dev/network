'use strict';

var kafka = require('kafka-node')
var decoder = require('./decoder')
var events = require('events')

function KafkaHelper(zookeeper) {
	var _this = this

	this.options = {
		zookeeper: zookeeper,
		kafkaOptions: {
			autoCommit: false, 
			fromOffset: true,
			encoding: 'buffer'
		},
		retryTime: 500
	}

	this.decoder = decoder
	this.client = this.createClient()
	this.consumer = this.createConsumer(this.client)
	this.offset = this.createOffset(this.client)

	this.client.on('error', function(err) {
		console.log("kafka client error: "+err)
	})

	this.consumer.on('message', function (message) {
		message.value = _this.decodeMessage(message)
		_this.emit('message', message.value, message.topic)
	});

	this.consumer.on('error', function (err) {
	    console.log('error', err);
	});

	this.consumer.on('offsetOutOfRange', function (topic) {
		console.log("Offset out of range for topic: "+JSON.stringify(topic))
	})
}

KafkaHelper.prototype.__proto__ = events.EventEmitter.prototype;

KafkaHelper.prototype.createClient = function(zk) {
	return new kafka.Client(zk || this.options.zookeeper)
}

KafkaHelper.prototype.createConsumer = function(client, topics, options) {
	return new kafka.Consumer(client, topics || [], options || this.options.kafkaOptions);
}

KafkaHelper.prototype.createOffset = function(client) {
	return new kafka.Offset(client);
}

KafkaHelper.prototype.getOffset = function(topic, earliest, cb, retryCount) {
	var _this = this

	this.offset.fetch([{topic:topic, time: (earliest ? -2 : -1)}], function (err, offsets) {
		// If the topic does not exist, the fetch request may fail with LeaderNotAvailable
		// or UnknownTopicOrPartition. It may also succeed but return an empty partition list.
		// Retry up to 10 times with 500ms intervals
		
		if (err=="LeaderNotAvailable" || err=="UnknownTopicOrPartition" || offsets[topic]["0"]==null || !offsets[topic]["0"].length) {
			retryCount = retryCount || 1
			
			if (retryCount <= 10) {
				console.log("Got LeaderNotAvailable for "+topic+", retry "+retryCount+" in 500ms...")
				setTimeout(function() {
					_this.getOffset(topic, earliest, cb, retryCount+1)
				}, _this.options.retryTime)
			}
			else {
				console.log("ERROR max retries reached, unable to fetch offset for "+topic)
			}
		}
		else if (err) {
			console.log("ERROR kafkaGetOffsets: "+err)
		}
		else {	
			console.log((earliest ? "Earliest offset: " : "Latest offset: ")+JSON.stringify(offsets))
			var offset = offsets[topic]["0"][0]
			cb(offset, earliest)
		}
	});
}

KafkaHelper.prototype.subscribe = function(topic, fromOffset, cb) {
	var _this = this

	var sub = function(offset) {
		_this.consumer.addTopics([{topic:topic, offset:offset}], function (err, added) {
			if (err)
				console.log("ERROR kafkaSubscribe: "+err)
			else {
				console.log("Subscribed to Kafka topic: "+topic+" from offset "+offset)
				if (cb)
					cb(topic, offset)
			}
		}, true)
	}

	// Subscribe from latest offset if not explicitly given
	if (fromOffset==null)
		this.getOffset(topic, false, sub)
	else 
		sub(fromOffset)
}

KafkaHelper.prototype.unsubscribe = function(topic, cb) {
	this.consumer.removeTopics([topic], function (err, removed) {
		if (err)
			console.log("ERROR kafkaUnsubscribe: "+err)
		else {
			console.log("Unsubscribed from topic: "+topic)
			if (cb)
				cb(topic)
		}
	});
}

// Decode the binary message to a JSON object
// Ensure the object has stream and counter keys required by client
KafkaHelper.prototype.decodeMessage = function(message) {
	var result = decoder.decode(message.value)

	result._S = message.topic
	result._C = message.offset

	return result
}

// TODO: support multiple-topic resend requests to save client/consumer resources
KafkaHelper.prototype.resend = function(topic, fromOffset, toOffset, handler, cb) {
	var _this = this

	if (toOffset<0 || toOffset < fromOffset) {
		console.log("Nothing to resend for topic "+topic)
		cb()
	}
	else {
		var req = {
			topic: topic,
			offset: fromOffset
		}

		// Create a local client and consumer for each resend request
		var client = this.createClient()
		var consumer = this.createConsumer(client, [req])
	
		consumer.on('message', function(message) {
			message.value = _this.decodeMessage(message)

			if (message.offset >= fromOffset && message.offset <= toOffset) {
				handler(message.value)
	
				if (message.offset === toOffset) {
					console.log("Resend ready, closing consumer...")
					consumer.close()
					client.close()
					consumer.removeAllListeners('message')
					cb()
				}
			}
			else {
				console.log("Received extra message "+message.offset+" during resend (fromOffset: "+fromOffset+", toOffset: "+toOffset+"): "+JSON.stringify(message))
			}
		})
	}
}

exports.KafkaHelper = KafkaHelper