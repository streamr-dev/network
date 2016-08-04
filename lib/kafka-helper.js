'use strict';

var kafka = require('kafka-node')
var protocol = require('kafka-node/lib/protocol')
var events = require('events')
var debug = require('debug')('KafkaHelper')

var decoder = require('./decoder')
var constants = require('./constants')

function extend() {
	var target = arguments[0]
	for (var i=0; i<arguments.length; i++) {
		var source = arguments[i]

		Object.keys(source).forEach(function(key) {
			target[key] = source[key]
		})
	}
	return target
}

function KafkaHelper(zookeeper) {
	var _this = this

	this.options = {
		zookeeper: zookeeper,
		kafkaConsumerOptions: {
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

	this.client.on('ready', function() {
		console.log("KafkaHelper ready")
		_this.emit('ready')
	})

	this.client.on('error', function(err) {
		console.log("kafka client error: "+err)
	})

	this.consumer.on('message', function (message) {
		var decoded = _this.decodeMessage(message)
		_this.emit('message', decoded, message.topic)
	});
}

KafkaHelper.prototype.__proto__ = events.EventEmitter.prototype;

KafkaHelper.prototype.createClient = function(zk) {
	debug('Creating Kafka client')
	return new kafka.Client(zk || this.options.zookeeper, "socketio-server-"+Date.now())
}

KafkaHelper.prototype.createConsumer = function(client, topics, options) {
	var topics = topics || []
	var opts = extend({},
		this.options.kafkaConsumerOptions,
		{ groupId: 'socketio-server-'+Date.now() },
		options || {})

	debug('Creating Kafka consumer with opts %o, topics %o', opts, topics)
	var consumer = kafka.Consumer(client, topics, opts);

	consumer.on('error', function (err) {
		console.log('kafka consumer error', err);
	});

	consumer.on('offsetOutOfRange', function (topic) {
		console.log("Offset out of range for topic: "+JSON.stringify(topic))
	})
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

		if (err)
			console.log("ERROR kafkaGetOffsets: "+err)
		
		if (err=="LeaderNotAvailable" || err=="UnknownTopicOrPartition" 
			|| !offsets || !offsets[topic] || !offsets[topic]["0"] || !offsets[topic]["0"].length) {

			retryCount = retryCount || 1
			
			if (retryCount <= 10) {
				console.log("Got error %s for topic %s, retry %d in %d millis", err, topic, retryCount, _this.options.retryTime)
				setTimeout(function() {
					_this.getOffset(topic, earliest, cb, retryCount+1)
				}, _this.options.retryTime)
			}
			else {
				console.log("ERROR max retries reached, unable to fetch offset for topic %s", topic)
				cb(undefined, undefined, err || "Unknown error")
			}
		}
		else if (!err) {
			debug(earliest ? "Earliest offset: %o" : "Latest offset: %o", offsets)
			var offset = offsets[topic]["0"][0]
			cb(offset, earliest)
		}
	});
}

KafkaHelper.prototype.subscribe = function(topic, fromOffset, cb) {
	var _this = this

	var sub = function(offset) {
		_this.consumer.addTopics([{topic:topic, offset:offset}], function (err, added) {
			if (err) {
				console.log("ERROR kafkaSubscribe: "+err)

				if (cb) {
					cb(topic, offset, err)
				}
			}
			else {
				debug("Subscribed to Kafka topic %s from offset %d", topic, offset)
				_this.emit("subscribed", topic, fromOffset)
				
				if (cb) {
					cb(topic, offset)
				}
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
	var _this = this
	this.consumer.removeTopics([topic], function (err, removed) {
		if (err)
			console.log("ERROR kafkaUnsubscribe: "+err)
		else {
			debug("Unsubscribed Kafka from topic %s", topic)
			_this.emit("unsubscribed", topic)
			if (cb)
				cb(topic)
		}
	});
}

// Decode the binary message to a JSON object
// Ensure the object has stream and counter keys required by client
KafkaHelper.prototype.decodeMessage = function(message, includeTimestamp) {
	var decodeResult = this.decoder.decode(message.value)

	decodeResult.message[constants.STREAM_KEY] = message.topic
	decodeResult.message[constants.COUNTER_KEY] = message.offset
	if (includeTimestamp)
		decodeResult.message[constants.TIMESTAMP_KEY] = decodeResult.timestamp

	return decodeResult.message
}

// TODO: support multiple-topic resend requests to save client/consumer resources
KafkaHelper.prototype.resend = function(topic, fromOffset, toOffset, handler, cb) {
	var _this = this

	if (toOffset<0 || toOffset < fromOffset) {
		debug("Nothing to resend for topic %s", topic)
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
			var decoded = _this.decodeMessage(message)

			if (message.offset >= fromOffset && message.offset <= toOffset) {
				handler(decoded)
	
				if (message.offset === toOffset) {
					debug("Resend ready for %s from %d to %d, closing consumer...", topic, fromOffset, toOffset)
					consumer.close()
					client.close()
					consumer.removeAllListeners('message')
					cb()
				}
			}
			else {
				debug("Received extra message %d during resend (fromOffset: %d, toOffset: %d): %o", message.offset, fromOffset, toOffset, JSON.stringify(message))
			}
		})
	}
}

KafkaHelper.prototype.getFirstOffsetAfter = function(topic, partition, date, cb) {
	var _this = this

	// Establish first and last available offset and their corresponding dates
	// Do the steps sequentially for now (for simplicity and easier debugging)

	var client = this.createClient()

	// Make sure the client gets called before calling callback
	cb = (function(origCallback) {
		return function(offset, err) {
			client.close()
			origCallback(offset, err)
		}
	})(cb)

	var whenReady = function() {
		debug("getFirstOffsetAfter: getting first and last offsets")
		_this.getOffset(topic, true, function(firstOffset) {
			_this.getOffset(topic, false, function(lastOffset) {
				debug("firstOffset: %d, lastOffset: %d",firstOffset,lastOffset);
				_this.getTimestampForOffset(client, topic, partition, firstOffset, function(firstDate, firstDateError) {
					if (firstDateError) {
						cb(undefined, firstDateError)
					}
					else _this.getTimestampForOffset(client, topic, partition, lastOffset-1, function(lastDate, lastDateError) {
						if (lastDateError) {
							cb(undefined, lastDateError) 
						}
						else {
							debug("firstDate: %s, lastDate: %s",firstDate,lastDate);

						    if (date <= firstDate) {
						    	cb(firstOffset)
						    }
						    else if (date === lastDate) {
						    	cb(lastOffset-1)
						    }
						    else if (date > lastDate) {
						    	cb(lastOffset)
						    }
						    else _this.binarySearchOffsetForDate(client, topic, partition, date, firstOffset, lastOffset-1, function(offset, searchError) {
						    	if (searchError)
						    		cb(undefined, searchError)
						    	else cb(offset)
						    })
						}
					})
				})
			})
		})
	}

	if (client.ready)
		whenReady()
	else client.on('ready', whenReady)
}

KafkaHelper.prototype.getTimestampForOffset = function(client, topic, partition, offset, cb) {
	var _this = this

	var consumer = new events.EventEmitter()
	consumer.options = this.consumer.options

	var reportError = function(err) {
		unbindAll()
		cb(undefined, err)
	}

	var messageHandler = function(message) {
		var decoded = _this.decodeMessage(message, true)
		debug("getTimestampForOffset: Response for topic: %s, partition: %d, offset: %d, timestamp: %s", topic, partition, offset, decoded._T)
		unbindAll()
		cb(decoded._T)
	}

	var unbindAll = function() {
		consumer.removeListener('offsetOutOfRange', reportError)
		consumer.removeListener('error', reportError)
		consumer.removeListener('message', messageHandler)
	}

	consumer.on('offsetOutOfRange', reportError)
	consumer.on('error', reportError)
	consumer.on('message', messageHandler)

	debug("getTimestampForOffset: Sending fetch request for topic: %s, partition: %d, offset: %d", topic, partition, offset)

	setTimeout(function() {
		client.sendFetchRequest(consumer, 
			[{
				topic: topic,
				partition: partition,
				offset: offset,
				maxBytes: 1024*1024
			}],
			0, // fetchMaxWaitMs
			0, // fetchMinBytes
			1 // maxTickMessages
		)
	}, 0)
}

KafkaHelper.prototype.binarySearchOffsetForDate = function(client, topic, partition, date, low, high, cb) {
	var _this = this
	if (low <= high) {
		// invariants: value > A[i] for all i < low
		//             value < A[i] for all i > high
		var mid = Math.floor((low + high) / 2);
		_this.getTimestampForOffset(client, topic, partition, mid, function(midDate, err) {
			if (err) {
				cb(undefined, err)
			}
			else if (midDate > date) {
				high = mid - 1;
				// Async recursion to avoid deep stack
				setTimeout(function() {
					_this.binarySearchOffsetForDate(client, topic, partition, date, low, high, cb)
				}, 0)
			}
			else if (midDate < date) {
				low = mid + 1;
				// Async recursion to avoid deep stack
				setTimeout(function() {
					_this.binarySearchOffsetForDate(client, topic, partition, date, low, high, cb)
				}, 0)
			}
			else {
				// ready!
				cb(mid);
			}
	  })
	}
	else cb(low);
}

module.exports = KafkaHelper

