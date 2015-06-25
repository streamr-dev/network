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

function Subscription(streamId, callback, options) {
	if (!streamId)
		throw "No stream id given!"
	if (!callback)
		throw "No callback given!"

	var _this = this
	
	this.streamId = streamId
	this.callback = callback
	this.options = options || {}
	this.queue = []
	this.counter = 0
	this.subscribed = false

	// Check that multiple resend options are not given
	var resendOptionCount = 0
	if (this.options.resend_all)
		resendOptionCount++
	if (this.options.resend_from!=null)
		resendOptionCount++
	if (this.options.resend_last!=null)
		resendOptionCount++
	if (this.options.resend_from_time!=null)
		resendOptionCount++
	if (resendOptionCount>1)
		throw "Multiple resend options active! Please use only one: "+JSON.stringify(options)

	// Automatically convert Date objects to numbers for resend_from_time
	if (this.options.resend_from_time != null 
		&& typeof this.options.resend_from_time !== 'number') {

		if (typeof this.options.resend_from_time.getTime === 'function')
			this.options.resend_from_time = this.options.resend_from_time.getTime()
		else throw "resend_from_time option must be a Date object or a number representing time!"
	}

	/*** Message handlers ***/

	this.bind('subscribed', function(response) {
		console.log("subscribed: "+response.channel+" from "+response.from)

		_this.subscribed = true
		if (response.from!=null)
			_this.counter = response.from
	})

	this.bind('unsubscribed', function(response) {
		console.log("unsubscribed: "+response.channel)
		_this.subscribed = false
	})

	this.bind('resending', function(response) {
		console.log("resending: "+response.channel+" next message set to "+response.from+", was: "+_this.counter)
		_this.counter = response.from
	})

	this.bind('no_resend', function(response) {
		console.log("no_resend: "+response.channel+" next message set to "+response.next+", was: "+_this.counter)

		_this.counter = response.next
		_this.resending = false
		_this.checkQueue()
	})

	this.bind('resent', function(response) {
		console.log("resent: "+response.channel+" from "+response.from+" to "+response.to)
		
		_this.resending = false
		_this.checkQueue()
	})

	this.bind('connected', function() {

	})

	this.bind('disconnected', function() {
		_this.subscribed = false
		_this.resending = false
	})

}

MicroEvent.mixin(Subscription)

Subscription.prototype.handleMessage = function(message) {
	// Update ack counter
	if (message[COUNTER_KEY] > this.counter) {
		this.queue.push(message)
		
		if (!this.resending) {
			console.log("Gap detected, requesting resend for channel "+this.streamId)
			this.trigger('gap', this.counter, message[COUNTER_KEY]-1)
		}
	}
	else if (message[COUNTER_KEY] < this.counter) {
		console.log("Already received message: "+message[COUNTER_KEY]+", expecting: "+this.counter)
	}
	else {
		var bye = message[BYE_KEY]
		this.counter = message[COUNTER_KEY] + 1

		delete message[COUNTER_KEY]
		delete message[STREAM_KEY]
		delete message[BYE_KEY]

		this.callback(message)

		if (bye)
			this.trigger('done')
	}
}

Subscription.prototype.checkQueue = function() {
	if (this.queue.length) {
		console.log("Attempting to process "+this.queue.length+" queued messages for stream "+this.streamId)
		
		var i
		for (i=0;i<this.queue.length;i++) {
			// If the counter is correct, process the message
			if (this.queue[i][COUNTER_KEY] === this.counter)
				this.handleMessage(this.queue[i])
			// Ignore old messages in the queue
			else if (this.queue[i][COUNTER_KEY] < this.counter)
				continue
			// Else stop looping
			else if (this.queue[i][COUNTER_KEY] > this.counter)
				break
		}
		
		// All messages in queue were processed
		if (i===this.queue.length) {
			this.queue = []
		}
		// Some messages could not be processed, so compact the queue 
		// and request another resend for the gap!
		else {
			this.queue.splice(0, i)
			this.trigger('gap', this.counter, this.queue[0][COUNTER_KEY]-1)
		}
	}
}

Subscription.prototype.hasResendOptions = function() {
	return this.options.resend_all===true || this.options.resend_from >= 0 || this.options.resend_from_time >= 0 || this.options.resend_last > 0
}

Subscription.prototype.isSubscribed = function() {
	return this.subscribed
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

	if (!streamId)
		throw "subscribe: Invalid arguments: stream id is required!"
	else if (typeof streamId !== 'string')
		throw "subscribe: stream id must be a string!"

	if (!callback)
		throw "subscribe: Invalid arguments: callback is required!"

	// Register this stream if not already registered
	if (!this.streams[streamId]) {
		this.streams[streamId] = new Subscription(streamId, callback, options)

		this.streams[streamId].bind('gap', function(from, to) {
			_this.requestResend(streamId, {resend_from: from, resend_to: to})
		})

		this.streams[streamId].bind('done', function() {
			_this.unsubscribe(streamId)
		})
	}

	// If connected, emit a subscribe request
	if (this.connected) {
		this.requestSubscribe(streamId)
	} else if (this.options.autoConnect) {
		this.connect()
	}

	return this.streams[streamId]
}

StreamrClient.prototype.unsubscribe = function(streamId) {
	if (!streamId)
		throw "unsubscribe: stream id is required!"
	else if (typeof streamId !== 'string')
		throw "unsubscribe: stream id must be a string!"

	// If connected, emit a subscribe request
	if (this.connected) {
		this.requestUnsubscribe(streamId)
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
	else if (this.connecting) {
		console.log("connect() called while connecting, doing nothing...")
		return this.streams
	}
	
	console.log("Connecting to "+this.options.server)
	this.connecting = true
	this.socket = io(this.options.server, {forceNew: true})

	this.socket.on('ui', function(data) {
		if (typeof data == 'string' || data instanceof String) {
			data = JSON.parse(data)
		}
		// Look up the handler
		_this.streams[data[STREAM_KEY]].handleMessage(data)
	})
	
	this.socket.on('subscribed', function(response) {
		if (response.error) {
			_this.handleError("Error subscribing to "+response.channel+": "+response.error)
		}
		else {
			_this.streams[response.channel].trigger('subscribed', response)
			_this.trigger('subscribed', response)
		}
	})

	this.socket.on('unsubscribed', function(response) {
		var sub = _this.streams[response.channel]
		delete _this.streams[response.channel]
		sub.trigger('unsubscribed', response)
		_this.trigger('unsubscribed', response)

		// Disconnect if no longer subscribed to any channels
		if (Object.keys(_this.streams).length===0 && _this.options.autoDisconnect) {
			console.log("Disconnecting due to no longer being subscribed to any channels")
			_this.disconnect()
		}
	})

	// The resending event is sent by the server before a resend starts.
	this.socket.on('resending', function(response) {
		_this.streams[response.channel].trigger('resending', response)
	})

	this.socket.on('no_resend', function(response) {
		_this.streams[response.channel].trigger('no_resend', response)
	})

	this.socket.on('resent', function(response) {
		_this.streams[response.channel].trigger('resent', response)
	})
	
	// On connect/reconnect, send pending subscription requests
	this.socket.on('connect', function() {
		console.log("Connected!")
		_this.connected = true
		_this.connecting = false
		_this.trigger('connected')
		
		for (var streamId in _this.streams) {
			_this.streams[streamId].trigger('connected')

			if (!_this.streams[streamId].subscribed) {
				_this.requestSubscribe(streamId)
			}
		}
	})

	this.socket.on('disconnect', function() {
		console.log("Disconnected.")
		_this.connected = false
		_this.connecting = false

		for (var streamId in _this.streams) {
			_this.streams[streamId].trigger('disconnected')
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
	this.connecting = false
}

StreamrClient.prototype.requestSubscribe = function(streamId, from) {
	var _this = this
	var stream = this.streams[streamId]
	var sub = {channel: streamId}

	// Resend from latest received message if messages have already been received
	if (stream.counter && (stream.options.resend_all || stream.options.resend_from!=null || stream.options.resend_from_time!=null)) {
		sub.from = stream.counter
	}
	// If subscription has resend options, do a resend first
	else if (stream.hasResendOptions()) {
		var onResent = function(response) {
			stream.unbind('resent', this)
			stream.unbind('no_resend', onNoResend)

			sub.from = response.to + 1

			console.log("subscribing on resent: "+JSON.stringify(sub))
			_this.socket.emit('subscribe', sub)	
		}
		var onNoResend = function(response) {
			stream.unbind('resent', onResent)
			stream.unbind('no_resend', this)

			sub.from = response.next
			
			console.log("subscribing on no_resend: "+JSON.stringify(sub))
			_this.socket.emit('subscribe', sub)	
		}
		stream.bind('resent', onResent)
		stream.bind('no_resend', onNoResend)

		this.requestResend(streamId, stream.options)
	}

	if (!stream.resending) {
		console.log("subscribe: "+JSON.stringify(sub))
		this.socket.emit('subscribe', sub)		
	}
}

StreamrClient.prototype.requestUnsubscribe = function(streamId) {
	console.log("Unsubscribing from "+JSON.stringify(streamId))
	this.socket.emit('unsubscribe', {channel: streamId})
}

StreamrClient.prototype.requestResend = function(streamId, options) {
	var stream = this.streams[streamId]
	stream.resending = true

	var request = {}
	Object.keys(options).forEach(function(key) {
		request[key] = options[key]
	})
	request.channel = streamId

	console.log("requestResend: "+JSON.stringify(request))
	this.socket.emit('resend', request)
}

StreamrClient.prototype.handleError = function(msg) {
	console.log(msg)
	this.trigger('error', msg)
}

exports.StreamrClient = StreamrClient

})(typeof(exports) !== 'undefined' ? exports : window)