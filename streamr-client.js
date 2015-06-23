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

function generateUUID() {
    var d = new Date().getTime();
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = (d + Math.random()*16)%16 | 0;
        d = Math.floor(d/16);
        return (c=='x' ? r : (r&0x3|0x8)).toString(16);
    });
    return uuid;
};

function Subscription(streamId, callback, options) {
	if (!streamId)
		throw "No stream id given!"
	if (!callback)
		throw "No callback given!"

	var _this = this
	
	this.id = generateUUID()
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
	if (resendOptionCount>1)
		throw "Multiple resend options active! Please use only one: "+JSON.stringify(options)

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
	return this.options.resend_all===true || this.options.resend_from >= 0 || this.options.resend_last > 0
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
	this.subsByStream = {}
	this.subById = {}

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

	// Create the Subscription object and bind handlers
	var sub = new Subscription(streamId, callback, options)
	sub.bind('gap', function(from, to) {
		_this.requestResend(streamId, {resend_from: from, resend_to: to})
	})
	sub.bind('done', function() {
		_this.unsubscribe(sub)
	})

	// Add to lookups
	this.subById[sub.id] = sub
	if (!this.subsByStream[streamId])
		this.subsByStream[streamId] = [sub]
	}
	else this.subsByStream[streamId].push(sub)

	// If connected, emit a subscribe request
	if (this.connected) {
		this.requestSubscribe(sub)
	} else if (this.options.autoConnect) {
		this.connect()
	}

	return sub
}

StreamrClient.prototype.unsubscribe = function(sub) {
	if (!sub)
		throw "unsubscribe: a Subscription object is required!"
	else if (typeof streamId !== 'string')
		throw "unsubscribe: stream id must be a string!"

	// If connected, emit a subscribe request
	if (this.connected) {
		this.requestUnsubscribe(streamId)
	}
	else {
		delete this.subsByStream[streamId]
	}
}

StreamrClient.prototype.unsubscribeAll = function(streamId) {
	var _this = this
	if (!streamId)
		throw "unsubscribeAll: a stream id is required!"
	else if (typeof streamId !== 'string')
		throw "unsubscribe: stream id must be a string!"

	if (this.subsByStream[streamId]) {
		// Copy the list to avoid concurrent modifications
		var l = this.subsByStream[streamId].slice()
		l.forEach(function(sub) {
			_this.unsubscribe(sub)
		})
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
		return this.subsByStream
	}
	else if (this.connecting) {
		console.log("connect() called while connecting, doing nothing...")
		return this.subsByStream
	}
	
	console.log("Connecting to "+this.options.server)
	this.connecting = true
	this.socket = io(this.options.server, {forceNew: true})

	this.socket.on('ui', function(data) {
		if (typeof data == 'string' || data instanceof String) {
			data = JSON.parse(data)
		}

		// Notify the Subscriptions for this stream. If this is not the message each individual Subscription is expecting, they will either ignore it or request resend.
		var subs = _this.subsByStream[data[STREAM_KEY]]
		for (var i=0;i<subs.length;i++)
			subs[i].handleMessage(data)
	})
	
	this.socket.on('subscribed', function(response) {
		if (response.error) {
			_this.handleError("Error subscribing to "+response.channel+": "+response.error)
		}
		else {
			var subs = _this.subsByStream[response.channel]
			for (var i=0;i<subs.length;i++)
				subs[i].trigger('subscribed', response)
			
			_this.trigger('subscribed', response)
		}
	})

	this.socket.on('unsubscribed', function(response) {
		_this.subsByStream[response.channel].trigger('unsubscribed', response)
		_this.trigger('unsubscribed', response)
		delete _this.subsByStream[response.channel]

		// Disconnect if no longer subscribed to any channels
		if (Object.keys(_this.subsByStream).length===0 && _this.options.autoDisconnect) {
			console.log("Disconnecting due to no longer being subscribed to any channels")
			_this.disconnect()
		}
	})

	// The resending event is sent by the server before a resend starts.
	this.socket.on('resending', function(response) {
		_this.subsByStream[response.channel].trigger('resending', response)
	})

	this.socket.on('no_resend', function(response) {
		_this.subsByStream[response.channel].trigger('no_resend', response)
	})

	this.socket.on('resent', function(response) {
		_this.subsByStream[response.channel].trigger('resent', response)
	})
	
	// On connect/reconnect, send pending subscription requests
	this.socket.on('connect', function() {
		console.log("Connected!")
		_this.connected = true
		_this.connecting = false
		_this.trigger('connected')
		
		for (var streamId in _this.subsByStream) {
			_this.subsByStream[streamId].trigger('connected')

			if (!_this.subsByStream[streamId].subscribed) {
				_this.requestSubscribe(streamId)
			}
		}
	})

	this.socket.on('disconnect', function() {
		console.log("Disconnected.")
		_this.connected = false
		_this.connecting = false

		for (var streamId in _this.subsByStream) {
			_this.subsByStream[streamId].trigger('disconnected')
		}

		_this.trigger('disconnected')
	})

	return this.subsByStream
}

StreamrClient.prototype.pause = function() {
	this.socket.disconnect()
}

StreamrClient.prototype.disconnect = function() {
	this.subsByStream = {}
	this.socket.disconnect()
	this.connecting = false
}

StreamrClient.prototype.requestSubscribe = function(streamId, from) {
	var _this = this
	var stream = this.subsByStream[streamId]
	var sub = {channel: streamId}

	// Change resend_all -> resend_from mode if messages have already been received

	if (stream.counter && (stream.options.resend_all || stream.options.resend_from!=null)) {
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
	var stream = this.subsByStream[streamId]
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