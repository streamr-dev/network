"use strict";

(function() {

	var io
	var debug
	if (typeof window !== 'undefined') {
		io = window.io
		debug = (window.debug ? window.debug('StreamrClient') : function() {
			if (window.consoleLoggingEnabled)
				console.log.apply(console, arguments)
		})
	}
	else {
		io = require('socket.io-client')
		debug = require('debug')('StreamrClient')
	}

	var BYE_KEY = "_bye"

	function extend() {
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
	MicroEvent.mixin = function(destObject) {
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

	var versionFields = {
		'28': ['version', 'streamId', 'streamPartition', 'timestamp', 'ttl', 'offset', 'previousOffset', 'contentType', 'content']
	}

	function getMessageField(field, msg) {
		if (msg == null || msg[0] == null || versionFields[msg[0]] == null) {
			return undefined
		}

		var idx = versionFields[msg[0].toString()].indexOf(field)
		if (idx >= 0) {
			return msg[idx]
		}
		else {
			return undefined
		}
	}

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
		this.subscribed = false
		this.lastReceivedOffset = null

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
			debug("Sub %s subscribed to stream: %s", _this.id, _this.streamId)
			_this.subscribed = true
		})

		this.bind('unsubscribed', function() {
			debug("Sub %s unsubscribed: %s", _this.id, _this.streamId)
			_this.subscribed = false
			_this.unsubscribing = false
			_this.resending = false
		})

		this.bind('resending', function(response) {
			debug("Sub %s resending: %o", _this.id, response)
			// _this.resending = true was set elsewhere before making the request
		})

		this.bind('no_resend', function(response) {
			debug("Sub %s no_resend: %o", _this.id, response)
			_this.resending = false
			_this.checkQueue()
		})

		this.bind('resent', function(response) {
			debug("Sub %s resent: %o", _this.id, response)
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

	Subscription.prototype.handleMessage = function(msg) {
		var content = getMessageField('content', msg)
		var timestamp = getMessageField('timestamp', msg)
		var offset = getMessageField('offset', msg)
		var previousOffset = getMessageField('previousOffset', msg)

		if (previousOffset == null) {
			debug("handleMessage: prevOffset is null, gap detection is impossible! message: %o", msg)
		}

		// Gap check
		if (previousOffset != null && 					// previousOffset is required to check for gaps
			this.lastReceivedOffset != null &&  		// and we need to know what msg was the previous one
			previousOffset > this.lastReceivedOffset &&	// previous message had larger offset than our previous msg => gap!
			!(this.options.resend_last != null && this.resending)) { // don't mind gaps when resending resend_last

			this.queue.push(msg)

			if (!this.resending) {
				var from = this.lastReceivedOffset + 1
				var to = previousOffset
				debug("Gap detected, requesting resend for stream %s from %d to %d", this.streamId, from, to)
				this.trigger('gap', from, to)
			}
		}
		// Prevent double-processing of messages for any reason
		else if (this.lastReceivedOffset != null && offset <= this.lastReceivedOffset) {
			debug("Sub %s already received message: %d, lastReceivedOffset: %d. Ignoring message.", this.id, offset, this.lastReceivedOffset)
		}
		// Normal case where prevOffset == null || lastReceivedOffset == null || prevOffset === lastReceivedOffset
		else {
			this.lastReceivedOffset = offset
			this.callback(content, this.streamId, timestamp, offset)
			if (content[BYE_KEY]) {
				this.trigger('done')
			}
		}
	}

	Subscription.prototype.checkQueue = function() {
		if (this.queue.length) {
			debug("Attempting to process %d queued messages for stream %s", this.queue.length, this.streamId)

			var i
			var length = this.queue.length
			for (i=0; i<length; i++) {
				var msg = this.queue[i]
				this.handleMessage(msg)
			}
		}
	}

	Subscription.prototype.hasResendOptions = function() {
		return this.options.resend_all===true || this.options.resend_from >= 0 || this.options.resend_from_time >= 0 || this.options.resend_last > 0
	}

	/**
	 * Resend needs can change if messages have already been received.
	 * This function always returns the effective resend options:
	 *
	 * If messages have been received:
	 * - resend_all becomes resend_from
	 * - resend_from becomes resend_from the latest received message
	 * - resend_from_time becomes resend_from the latest received message
	 * - resend_last stays the same
     */
	Subscription.prototype.getEffectiveResendOptions = function() {
		if (this.hasReceivedMessages() && this.hasResendOptions()) {
			if (this.options.resend_all || this.options.resend_from || this.options.resend_from_time) {
				return { resend_from: this.lastReceivedOffset + 1 }
			}
			else if (this.options.resend_last) {
				return this.options
			}
		}
		else {
			return this.options
		}
	}

	Subscription.prototype.hasReceivedMessages = function() {
		return this.lastReceivedOffset != null
	}

	Subscription.prototype.isSubscribed = function() {
		return this.subscribed
	}

	function StreamrClient(options) {
		// Default options
		this.options = {
			// The server to connect to
			server: "https://data.streamr.com",
			path: "/api/v1/socket.io",
			// Automatically connect on first subscribe
			autoConnect: true,
			// Automatically disconnect on last unsubscribe
			autoDisconnect: true,
			// Allow client socket library to choose appropriate transport
			transports: null
		}
		this.subsByStream = {}
		this.subById = {}

		this.io = io
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

		if (this.subsByStream[sub.streamId]) {
			this.subsByStream[sub.streamId] = this.subsByStream[sub.streamId].filter(function(it) {
				return it !== sub
			})

			if (this.subsByStream[sub.streamId].length === 0)
				delete this.subsByStream[sub.streamId]
		}
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
			debug("done event for sub %d", sub.id)
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
		if (this.subsByStream[sub.streamId] !== undefined && this.subsByStream[sub.streamId].length === 1 && this.connected && !this.disconnecting && sub.isSubscribed() && !sub.unsubscribing) {
			sub.unsubscribing = true
			this._requestUnsubscribe(sub.streamId)
		}
		// Else the sub can be cleaned off immediately
		else if (!sub.unsubscribing) {
			this._removeSubscription(sub)
			sub.trigger('unsubscribed')
			this._checkAutoDisconnect()
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
			debug("connect() called while already connected, doing nothing...")
			return
		}
		else if (this.connecting) {
			debug("connect() called while connecting, doing nothing...")
			return
		}

		debug("Connecting to %s", this.options.server)
		this.connecting = true
		this.disconnecting = false

		var options = extend({}, this.options, {forceNew: true})
		this.socket = this.io(this.options.server, options)

		// Broadcast messages to all subs listening on stream
		this.socket.on('b', function(msg) {
			// Notify the Subscriptions for this stream. If this is not the message each individual Subscription
			// is expecting, they will either ignore it or request resend via gap event.
			var streamId = getMessageField('streamId', msg)
			var subs = _this.subsByStream[streamId]
			if (subs) {
				for (var i=0;i<subs.length;i++)
					subs[i].handleMessage(msg)
			}
			else {
				debug('WARN: message received for stream with no subscriptions: %s', streamId)
			}
		})

		// Unicast messages to a specific subscription only
		this.socket.on('u', function(wrapper) {
			var msg = wrapper.m
			var sub = wrapper.sub

			if (sub !== undefined && _this.subById[sub] !== undefined) {
				_this.subById[sub].handleMessage(msg)
			}
			else {
				debug('WARN: subscription not found for stream: %s, sub: %s', getMessageField('streamId', msg), sub)
			}
		})

		this.socket.on('subscribed', function(response) {
			if (response.error) {
				_this.handleError("Error subscribing to "+response.channel+": "+response.error)
			}
			else {
				var subs = _this.subsByStream[response.channel]
				delete subs._subscribing

				debug('Client subscribed: %o', response)

				// Report subscribed to all non-resending Subscriptions for this stream
				subs.filter(function(sub) {
					return !sub.resending
				}).forEach(function(sub) {
					sub.trigger('subscribed', response)
				})
			}
		})

		this.socket.on('unsubscribed', function(response) {
			debug("Client unsubscribed: %o", response)

			if (_this.subsByStream[response.channel]) {
				// Copy the list to avoid concurrent modifications
				var l = _this.subsByStream[response.channel].slice()
				l.forEach(function(sub) {
					_this._removeSubscription(sub)
					sub.trigger('unsubscribed')
				})
			}

			_this._checkAutoDisconnect()
		})

		// Route resending state messages to corresponding Subscriptions
		this.socket.on('resending', function(response) {
			_this.subById[response.sub].trigger('resending', response)
		})

		this.socket.on('no_resend', function(response) {
			_this.subById[response.sub].trigger('no_resend', response)
		})

		this.socket.on('resent', function(response) {
			if (_this.subById[response.sub])
				_this.subById[response.sub].trigger('resent', response)
			else debug('resent: Subscription %d is gone already', response.sub)
		})

		// On connect/reconnect, send pending subscription requests
		this.socket.on('connect', function() {
			debug("Connected!")
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
			debug("Disconnected.")
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

	StreamrClient.prototype._checkAutoDisconnect = function() {
		// Disconnect if no longer subscribed to any channels
		if (Object.keys(this.subsByStream).length===0 && this.options.autoDisconnect) {
			debug("Disconnecting due to no longer being subscribed to any channels")
			this.disconnect()
		}
	}

	StreamrClient.prototype._resendAndSubscribe = function(sub) {
		var _this = this

		if (sub.hasResendOptions()) {
			var onResent = function(response) {
				sub.unbind('resent', this)
				sub.unbind('no_resend', onNoResend)
				_this._requestSubscribe(sub)
			}
			var onNoResend = function(response) {
				sub.unbind('resent', onResent)
				sub.unbind('no_resend', this)
				_this._requestSubscribe(sub)
			}
			sub.bind('resent', onResent)
			sub.bind('no_resend', onNoResend)

			this._requestResend(sub)
		}

		if (!sub.resending) {
			_this._requestSubscribe(sub)
		}
	}

	StreamrClient.prototype._requestSubscribe = function(sub) {
		var _this = this
		var subs = _this.subsByStream[sub.streamId]

		var subscribedSubs = subs.filter(function(it) {
			return it.isSubscribed()
		})

		// If this is the first subscription for this stream, send a subscription request to the server
		if (!subs._subscribing && subscribedSubs.length === 0) {
			var req = extend({}, sub.options, {channel: sub.streamId})
			debug("_requestSubscribe: subscribing client: %o", req)
			subs._subscribing = true
			_this.socket.emit('subscribe', req)
		}
		// If there already is a subscribed subscription for this stream, this new one will just join it immediately
		else if (subscribedSubs.length > 0) {
			debug('_requestSubscribe: another subscription for same stream: %s, insta-subscribing', sub.streamId)

			setTimeout(function() {
				sub.trigger('subscribed')
			}, 0)
		}
	}

	StreamrClient.prototype._requestUnsubscribe = function(streamId) {
		debug("Client unsubscribing stream %o", streamId)
		this.socket.emit('unsubscribe', {channel: streamId})
	}

	StreamrClient.prototype._requestResend = function(sub, resendOptions) {
		// If overriding resendOptions are given, need to remove resend options in sub.options
		var options = extend({}, sub.getEffectiveResendOptions())
		if (resendOptions) {
			Object.keys(options).forEach(function (key) {
				if (key.match(/resend_.*/)) {
					delete options[key]
				}
			})
		}

		sub.resending = true

		var request = extend({}, options, resendOptions, {channel: sub.streamId, sub: sub.id})
		debug("_requestResend: %o", request)
		this.socket.emit('resend', request)
	}

	StreamrClient.prototype.handleError = function(msg) {
		debug(msg)
		this.trigger('error', msg)
	}

	if (typeof module !== 'undefined' && module.exports)
		module.exports = StreamrClient
	else window.StreamrClient = StreamrClient

})(typeof(exports) !== 'undefined' ? exports : window)