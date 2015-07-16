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

var subId = 0
function generateSubscriptionId() {
	var id = subId++
	return id.toString()
};

/**
 * Subscription
 **/
function Subscription(streamId, callback, options) {
	if (!streamId)
		throw "No stream id given!"
	if (!callback)
		throw "No callback given!"

	var _this = this
	
	this.id = generateSubscriptionId()
	this.streamId = streamId
	this.callback = callback
	this.options = options || {}
	this.queue = []
	this.counter = null
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
		console.log("Sub "+_this.id+" subscribed: "+_this.streamId+" from "+response.from)

		_this.subscribed = true

		if (response.from!=null) 
			_this.counter = response.from
		// TODO: trigger gap event if the from field is not what we expected after a resend?
	})

	this.bind('unsubscribed', function() {
		console.log("Sub "+_this.id+" unsubscribed: "+_this.streamId)
		_this.subscribed = false
		_this.resending = false
	})

	this.bind('resending', function(response) {
		console.log("Sub "+_this.id+" resending: "+response.channel+" next message set to "+response.from+", was: "+_this.counter)
		_this.counter = response.from
	})

	this.bind('no_resend', function(response) {
		console.log("Sub "+_this.id+" no_resend: "+response.channel+" next message set to "+response.next+", was: "+_this.counter)

		_this.counter = response.next
		_this.resending = false
		_this.checkQueue()
	})

	this.bind('resent', function(response) {
		console.log("Sub "+_this.id+" resent: "+response.channel+" from "+response.from+" to "+response.to)
		
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
	if (this.counter === null && message[COUNTER_KEY]!==undefined) {
		console.log("Sub "+this.id+" received message "+message[COUNTER_KEY]+" but does not know what number to expect")
		return
	}

	// Update ack counter
	if (message[COUNTER_KEY] > this.counter) {
		this.queue.push(message)
		
		if (!this.resending) {
			console.log("Gap detected, requesting resend for channel "+this.streamId)
			this.trigger('gap', this.counter, message[COUNTER_KEY]-1)
		}
	}
	else if (message[COUNTER_KEY] < this.counter) {
		console.log("Sub "+this.id+" already received message: "+message[COUNTER_KEY]+", expecting: "+this.counter)
	}
	else {
		var bye = message[BYE_KEY]
		this.counter = message[COUNTER_KEY] + 1

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

/**
 * StreamClient
 **/

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

StreamrClient.prototype._addSubscription = function(sub) {
	this.subById[sub.id] = sub

	if (!this.subsByStream[sub.streamId])
		this.subsByStream[sub.streamId] = [sub]
	else this.subsByStream[sub.streamId].push(sub)
}

StreamrClient.prototype._removeSubscription = function(sub) {
	delete this.subById[sub.id]

	this.subsByStream[sub.streamId] = this.subsByStream[sub.streamId].filter(function(it) {
		return it !== sub
	})

	if (this.subsByStream[sub.streamId].length === 0)
		delete this.subsByStream[sub.streamId]
}

StreamrClient.prototype.getSubscriptions = function(streamId) {
	return this.subsByStream[streamId] || []
}

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
		_this._requestResend(sub, {resend_from: from, resend_to: to})
	})
	sub.bind('done', function() {
		_this.unsubscribe(sub)
	})

	// Add to lookups
	this._addSubscription(sub)

	// If connected, emit a subscribe request
	if (this.connected) {
		this._resendAndSubscribe(sub)
	} else if (this.options.autoConnect) {
		this.connect()
	}

	return sub
}

StreamrClient.prototype.unsubscribe = function(sub) {
	if (!sub || !sub.streamId)
		throw "unsubscribe: please give a Subscription object as an argument!"

	// If this is the last subscription for this stream, unsubscribe the client too
	if (this.subsByStream[sub.streamId].length === 1 && this.connected && !this.disconnecting) {
		this._requestUnsubscribe(sub.streamId)
	}
	// Else the sub can be cleaned off immediately
	else {
		this._removeSubscription(sub)
		sub.trigger('unsubscribed')
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
		return
	}
	else if (this.connecting) {
		console.log("connect() called while connecting, doing nothing...")
		return
	}
	
	console.log("Connecting to "+this.options.server)
	this.connecting = true
	this.disconnecting = false

	this.socket = io(this.options.server, {forceNew: true})

	this.socket.on('ui', function(data) {
		if (typeof data == 'string' || data instanceof String) {
			data = JSON.parse(data)
		}

		// If the message targets a specific subscription via _sub, only report the message to that
		if (data._sub!==undefined) {
			_this.subById[data._sub].handleMessage(data)
		}
		else {
			// Notify the Subscriptions for this stream. If this is not the message each individual Subscription 
			// is expecting, they will either ignore it or request resend via gap event.
			var subs = _this.subsByStream[data[STREAM_KEY]]
			for (var i=0;i<subs.length;i++)
				subs[i].handleMessage(data)
		}
	})
	
	this.socket.on('subscribed', function(response) {
		if (response.error) {
			_this.handleError("Error subscribing to "+response.channel+": "+response.error)
		}
		else {
			var subs = _this.subsByStream[response.channel]
			delete subs._subscribing

			console.log('Client subscribed: '+JSON.stringify(response))

			// Report subscribed to all non-resending Subscriptions for this stream
			subs.filter(function(sub) { 
				return !sub.resending 
			}).forEach(function(sub) {
				sub.trigger('subscribed', response)
			})
		}
	})

	this.socket.on('unsubscribed', function(response) {
		console.log("Client unsubscribed: "+JSON.stringify(response))

		// Copy the list to avoid concurrent modifications
		var l = _this.subsByStream[response.channel].slice()
		l.forEach(function(sub) {
			_this._removeSubscription(sub)
			sub.trigger('unsubscribed')
		})

		// Disconnect if no longer subscribed to any channels
		if (Object.keys(_this.subsByStream).length===0 && _this.options.autoDisconnect) {
			console.log("Disconnecting due to no longer being subscribed to any channels")
			_this.disconnect()
		}
	})

	// Route resending state messages to corresponding Subscriptions
	this.socket.on('resending', function(response) {
		_this.subById[response.sub].trigger('resending', response)
	})

	this.socket.on('no_resend', function(response) {
		_this.subById[response.sub].trigger('no_resend', response)
	})

	this.socket.on('resent', function(response) {
		_this.subById[response.sub].trigger('resent', response)
	})
	
	// On connect/reconnect, send pending subscription requests
	this.socket.on('connect', function() {
		console.log("Connected!")
		_this.connected = true
		_this.connecting = false
		_this.disconnecting = false
		_this.trigger('connected')
		
		Object.keys(_this.subsByStream).forEach(function(streamId) {
			var subs = _this.subsByStream[streamId]
			subs.forEach(function(sub) {
				if (!sub.isSubscribed()) {
					_this._resendAndSubscribe(sub)
				}
			})
		})
	})

	this.socket.on('disconnect', function() {
		console.log("Disconnected.")
		_this.connected = false
		_this.connecting = false
		_this.disconnecting = false
		_this.trigger('disconnected')

		Object.keys(_this.subsByStream).forEach(function(streamId) {
			var subs = _this.subsByStream[streamId]
			delete subs._subscribing
			subs.forEach(function(sub) {
				sub.trigger('disconnected')
			})
		})
	})

	return this.subsByStream
}

StreamrClient.prototype.pause = function() {
	this.socket.disconnect()
}

StreamrClient.prototype.disconnect = function() {
	var _this = this
	this.connecting = false
	this.disconnecting = true

	Object.keys(this.subsByStream).forEach(function(streamId) {
		_this.unsubscribeAll(streamId)
	})

	this.socket.disconnect()
}

StreamrClient.prototype._resendAndSubscribe = function(sub) {
	var _this = this

	var from = undefined

	// Resend from latest received message if messages have already been received
	if (sub.counter && (sub.options.resend_all || sub.options.resend_from!=null || sub.options.resend_from_time!=null)) {
		from = sub.counter
	}
	// If subscription has resend options, do a resend first
	else if (sub.hasResendOptions()) {
		var onResent = function(response) {
			sub.unbind('resent', this)
			sub.unbind('no_resend', onNoResend)
			from = response.to + 1
			_this._requestSubscribe(sub, from)
		}
		var onNoResend = function(response) {
			sub.unbind('resent', onResent)
			sub.unbind('no_resend', this)
			from = response.next
			_this._requestSubscribe(sub, from)
		}
		sub.bind('resent', onResent)
		sub.bind('no_resend', onNoResend)

		this._requestResend(sub)
	}

	if (!sub.resending) {
		_this._requestSubscribe(sub, from)
	}
}

StreamrClient.prototype._requestSubscribe = function(sub, from) {
	var _this = this
	var subs = _this.subsByStream[sub.streamId]

	var subscribedSubs = subs.filter(function(it) {
		return it.isSubscribed()
	})

	// If this is the first subscription for this stream, send a subscription request to the server
	if (!subs._subscribing && subscribedSubs.length === 0) {
		var req = {channel: sub.streamId, from: from}
		console.log("_requestSubscribe: subscribing client: "+JSON.stringify(req))
		subs._subscribing = true
		_this.socket.emit('subscribe', req)	
	}
	// If there already is a subscribed subscription for this stream, this new one will just join it immediately
	else if (subscribedSubs.length > 0) {
		if (from === undefined) {
			// Find the max received counter
			var counters = subscribedSubs.map(function(it) {
				return it.counter
			})
			from = Math.max.apply(Math, counters)
		}

		console.log('_requestSubscribe: another subscription for same stream: '+sub.streamId+', insta-subscribing from '+from)

		setTimeout(function() {
			sub.trigger('subscribed', {from: from})
		}, 0)
	}
}

StreamrClient.prototype._requestUnsubscribe = function(streamId) {
	console.log("Client unsubscribing from "+JSON.stringify(streamId))
	this.socket.emit('unsubscribe', {channel: streamId})
}

StreamrClient.prototype._requestResend = function(sub, options) {
	options = options || sub.options

	sub.resending = true

	var request = {}
	Object.keys(options).forEach(function(key) {
		request[key] = options[key]
	})
	request.channel = sub.streamId
	request.sub = sub.id

	console.log("_requestResend: "+JSON.stringify(request))
	this.socket.emit('resend', request)
}

StreamrClient.prototype.handleError = function(msg) {
	console.log(msg)
	this.trigger('error', msg)
}

exports.StreamrClient = StreamrClient

})(typeof(exports) !== 'undefined' ? exports : window)