'use strict';

var kafka = require('kafka-node')
var decoder = require('./decoder')
var events = require('events')

function KafkaHelper(zookeeper, client, consumer, ) {

	this.options = {
		zookeeper: zookeeper,
		kafkaOptions: {
			autoCommit: false, 
			fromOffset: true,
			encoding: 'buffer'
		}
	}

	this.client = new kafka.Client(this.options.zookeeper);
	this.consumer = new kafka.Consumer(this.client, [], this.options.kafkaOptions);
	this.offset = new kafka.Offset(this.client);

	this.client.on('error', function(err) {
		console.log("kafka client error: "+err)
	})

	this.consumer.on('message', function (message) {
		message.value = kafkaDecodeMessage(message)
		this.emit('message', message.value, message.topic)
	});

	this.consumer.on('error', function (err) {
	    console.log('error', err);
	});

	this.consumer.on('offsetOutOfRange', function (topic) {
		console.log("Offset out of range for topic: "+JSON.stringify(topic))
	})
}

KafkaHelper.prototype.__proto__ = events.EventEmitter.prototype;

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
				}, 500)
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

KafkaHelper.prototype.subscribe = function(topic, fromOffset) {
	var _this = this

	var sub = function(offset) {
		_this.consumer.addTopics([{topic:topic, offset:offset}], function (err, added) {
			if (err)
				console.log("ERROR kafkaSubscribe: "+err)
			else 
				console.log("Subscribed to Kafka topic: "+topic+" from offset "+offset)
		}, true)
	}

	// Subscribe from latest offset if not explicitly given
	if (fromOffset==null)
		this.getOffset(topic, false, sub)
	else 
		sub(fromOffset)
}

KafkaHelper.prototype.unsubscribe = function(topic) {
	this.consumer.removeTopics([topic], function (err, removed) {
		if (err)
			console.log("ERROR kafkaUnsubscribe: "+err)
		else
			console.log("Unsubscribed from topic: "+topic)
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
		var client = new kafka.Client(this.options.zookeeper);
		var consumer = new kafka.Consumer(client, [req], this.options.kafkaOptions);
	
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