(function(exports) {

var STREAM_KEY = "_S"
var COUNTER_KEY = "_C"
var BYE_KEY = "_bye"

function extend(){
    for(var i=1; i<arguments.length; i++)
        for(var key in arguments[i])
            if(arguments[i].hasOwnProperty(key))
                arguments[0][key] = arguments[i][key];
    return arguments[0];
}

/**
 * MicroEvent - to make any js object an event emitter (server or browser)
 * 
 * - pure javascript - server compatible, browser compatible
 * - dont rely on the browser doms
 * - super simple - you get it immediatly, no mistery, no magic involved
 *
 * - create a MicroEventDebug with goodies to debug
 *   - make it safer to use
*/

var MicroEvent	= function(){};
MicroEvent.prototype = {
	bind	: function(event, fct){
		this._events = this._events || {};
		this._events[event] = this._events[event]	|| [];
		this._events[event].push(fct);
	},
	unbind	: function(event, fct){
		this._events = this._events || {};
		if( event in this._events === false  )	return;
		this._events[event].splice(this._events[event].indexOf(fct), 1);
	},
	trigger	: function(event /* , args... */){
		this._events = this._events || {};
		if( event in this._events === false  )	return;
		for(var i = 0; i < this._events[event].length; i++){
			this._events[event][i].apply(this, Array.prototype.slice.call(arguments, 1));
		}
	}
};

/**
 * mixin will delegate all MicroEvent.js function in the destination object
 *
 * - require('MicroEvent').mixin(Foobar) will make Foobar able to use MicroEvent
 *
 * @param {Object} the object which will support MicroEvent
*/
MicroEvent.mixin	= function(destObject){
	var props	= ['bind', 'unbind', 'trigger'];
	for(var i = 0; i < props.length; i ++){
		if( typeof destObject === 'function' ){
			destObject.prototype[props[i]]	= MicroEvent.prototype[props[i]];
		}else{
			destObject[props[i]] = MicroEvent.prototype[props[i]];
		}
	}
}

function StreamrClient(options) {
	// Default options
	this.options = {
		// The server to connect to
		server: "api.streamr.com",
		// Automatically connect on first subscribe
		autoConnect: true,
		// Automatically disconnect on last unsubscribe
		autoDisconnect: true
	}
	this.streams = {}
	this.socket = null
    this.connected = false

    // Can give server URL as parameter instead of options object
    if (typeof options === "string")
    	this.options.server = options
    else
		extend(this.options, options || {})
}

MicroEvent.mixin(StreamrClient)

StreamrClient.prototype.subscribe = function(streamId, callback, options) {
	var _this = this
	options = options || { resend_last: 0 }

	var resendOptionCount = 0
	// Check that multiple resend options are not given
	if (options.resend_all)
		resendOptionCount++
	if (options.resend_from!=null)
		resendOptionCount++
	if (options.resend_last!=null)
		resendOptionCount++
	if (resendOptionCount>1)
		throw "Multiple resend options active! Please use only one: "+JSON.stringify(options)

	// If none of the resend options are given, use resend_last=0
	if (!options.resend_all && !options.resend_from && !options.resend_last) {
		options.resend_last = 0
	}

	// Register this stream if not already registered
	if (!this.streams[streamId]) {
		this.streams[streamId] = {
			handler: function(response) {
				_this.handleResponse(response, streamId, callback)
			},
			options: options,
			queue: [],
			counter: 0,
			subscribed: false
		}
	}

	// If connected, emit a subscribe request
	if (this.connected) {
		this.requestSubscribe([streamId])
	} else if (this.options.autoConnect) {
		this.connect()
	}

	return this.streams[streamId]
}

StreamrClient.prototype.unsubscribe = function(streamId) {
	// If connected, emit a subscribe request
	if (this.connected) {
		this.requestUnsubscribe([streamId])
	}
	else {
		delete this.streams[streamId]
	}
}

StreamrClient.prototype.isConnected = function() {
	return this.connected
}

StreamrClient.prototype.reconnect = function() {
	return this.connect(true)
}

StreamrClient.prototype.connect = function(reconnect) {
	var _this = this
	
	if (this.connected) {
		console.log("connect() called while already connected, doing nothing...")
		return this.streams
	}
	else if (this._connecting) {
		console.log("connect() called while connecting, doing nothing...")
		return this.streams
	}
	
	console.log("Connecting to "+this.options.server)
	this._connecting = true
	this.socket = io(this.options.server, {forceNew: true})
	
	this.socket.on('ui', function(data) {
		if (typeof data == 'string' || data instanceof String) {
			data = JSON.parse(data)
		}
		
		// Look up the handler
		_this.streams[data[STREAM_KEY]].handler(data)
	})
	
	this.socket.on('subscribed', function(data) {
		console.log("Subscribed to "+data.channels)
		data.channels.forEach(function(channel) {
			_this.streams[channel].subscribed = true
		})
		_this.trigger('subscribed', data.channels)
	})

	this.socket.on('unsubscribed', function(data) {
		console.log("Unsubscribed from "+data.channel)
		delete _this.streams[data.channel]
		_this.trigger('unsubscribed', data.channel)

		// Disconnect if no longer subscribed to any channels
		if (Object.keys(_this.streams).length===0 && _this.options.autoDisconnect) {
			console.log("Disconnecting due to no longer being subscribed to any channels")
			_this.disconnect()
		}
	})

	// The expect event is sent by the server before a resend starts.
	// It lets the client know what counter to expect next.
	this.socket.on('expect', function(data) {
		var stream = _this.streams[data.channel]
		console.log(data.channel+" expecting "+data.from+" instead of "+stream.counter)
		stream.counter = data.from
	})

	// 
	this.socket.on('resent', function(data) {
		var stream = _this.streams[data.channel]
		stream.resending = false
		
		console.log("Channel resend complete: "+data.channel)
		
		if (stream.queue.length) {
			console.log("Attempting to process "+stream.queue.length+" queued messages for channel "+data.channel)
			
			var i
			for (i=0;i<stream.queue.length;i++) {
				// If the counter is correct, process the message
				if (stream.queue[i][COUNTER_KEY] === stream.counter)
					stream.handler(stream.queue[i])
				// Ignore old messages in the queue
				else if (stream.queue[i][COUNTER_KEY] < stream.counter)
					continue
				// Else stop looping
				else if (stream.queue[i][COUNTER_KEY] > stream.counter)
					break
			}
			
			// All messages in queue were processed
			if (i===stream.queue.length) {
				stream.queue = []
			}
			// Some messages could not be processed, so compact the queue 
			// and request another resend for the gap!
			else {
				stream.queue.splice(0, i)
				_this.requestResend(data.channel, stream.counter, stream.queue[0][COUNTER_KEY]-1)
			}
		}
	})
	
	// On connect/reconnect, send pending subscription requests
	this.socket.on('connect', function() {
		console.log("Connected!")
		_this.connected = true
		_this.connecting = false
		_this.trigger('connected')
		
		var streamIds = []
		for (var streamId in _this.streams) {
			if (!_this.streams[streamId].subscribed) {
				streamIds.push(streamId)
			}
		}

		if (streamIds.length>0) 
			_this.requestSubscribe(streamIds)
		else console.log("No pending subscriptions on connect.")
	})

	this.socket.on('disconnect', function() {
		console.log("Disconnected.")
		_this.connected = false
		_this.connecting = false

		for (var streamId in _this.streams) {
			_this.streams[streamId].subscribed = false
		}

		_this.trigger('disconnected')
	})

	return this.streams
}

StreamrClient.prototype.pause = function() {
	this.socket.disconnect()
}

StreamrClient.prototype.disconnect = function() {
	this.streams = {}
	this.socket.disconnect()
	this._connecting = false
}

StreamrClient.prototype.requestSubscribe = function(streamIds) {
	var _this = this
	var subscriptions = []

	streamIds.forEach(function(streamId) {
		var stream = _this.streams[streamId]
		var sub = {channel: streamId, options: stream.options }

		// Change resend_all -> resend_from mode if messages have already been received
		if (stream.counter && (stream.options.resend_all || stream.options.resend_from!=null)) {
			delete sub.options.resend_all
			sub.options.resend_from = stream.counter
		}

		console.log("Waiting for resend/expect for channel "+streamId)
		stream.resending = true
		subscriptions.push(sub)
	})

	console.log("Subscribing to "+JSON.stringify(subscriptions))
	this.socket.emit('subscribe', subscriptions)
}

StreamrClient.prototype.requestUnsubscribe = function(streamIds) {
	console.log("Unsubscribing from "+JSON.stringify(streamIds))
	this.socket.emit('unsubscribe', {channels: streamIds})
}

StreamrClient.prototype.requestResend = function(streamId, from, to) {
	var stream = this.streams[streamId]
	stream.resending = true
	
	console.log("Requesting resend for "+streamId+" from "+from+" to "+to)
	this.socket.emit('resend', {channel:streamId, from:from, to:to})
}

StreamrClient.prototype.handleResponse = function(message, streamId, callback) {
	var stream = this.streams[streamId]
		
	// Update ack counter
	if (message[COUNTER_KEY] > stream.counter) {
		stream.queue.push(message)
		
		if (!stream.resending) {
			console.log("Gap detected, requesting resend for channel "+streamId)
			this.requestResend(streamId, stream.counter, message[COUNTER_KEY]-1)
		}
	}
	else if (message[COUNTER_KEY] < stream.counter) {
		console.log("Already received message: "+message[COUNTER_KEY]+", expecting: "+stream.counter);
	}
	else {
		var bye = message[BYE_KEY]
		stream.counter = message[COUNTER_KEY] + 1;

		delete message[COUNTER_KEY]
		delete message[STREAM_KEY]
		delete message[BYE_KEY]

		callback(message);

		if (bye)
			this.unsubscribe(streamId)
	}
}

exports.StreamrClient = StreamrClient

})(typeof(exports) !== 'undefined' ? exports : window)