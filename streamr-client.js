"use strict";

(function() {

	var debug
	var WebSocket
	if (typeof window !== 'undefined') {
		debug = (window.debug ? window.debug('StreamrClient') : function() {
			if (window.consoleLoggingEnabled)
				console.log.apply(console, arguments)
		})
	}
	else {
		debug = require('debug')('StreamrClient')
		WebSocket = require('ws')
	}

	var BYE_KEY = "_bye"

	function extend() {
		for(var i=1; i<arguments.length; i++)
			for(var key in arguments[i])
				if(arguments[i].hasOwnProperty(key))
					arguments[0][key] = arguments[i][key];
		return arguments[0];
	}


	var EventEmitter = (function() {
		'use strict';

		var has = Object.prototype.hasOwnProperty
			, prefix = '~';

		/**
		 * Constructor to create a storage for our `EE` objects.
		 * An `Events` instance is a plain object whose properties are event names.
		 *
		 * @constructor
		 * @api private
		 */
		function Events() {}

//
// We try to not inherit from `Object.prototype`. In some engines creating an
// instance in this way is faster than calling `Object.create(null)` directly.
// If `Object.create(null)` is not supported we prefix the event names with a
// character to make sure that the built-in object properties are not
// overridden or used as an attack vector.
//
		if (Object.create) {
			Events.prototype = Object.create(null);

			//
			// This hack is needed because the `__proto__` property is still inherited in
			// some old browsers like Android 4, iPhone 5.1, Opera 11 and Safari 5.
			//
			if (!new Events().__proto__) prefix = false;
		}

		/**
		 * Representation of a single event listener.
		 *
		 * @param {Function} fn The listener function.
		 * @param {Mixed} context The context to invoke the listener with.
		 * @param {Boolean} [once=false] Specify if the listener is a one-time listener.
		 * @constructor
		 * @api private
		 */
		function EE(fn, context, once) {
			this.fn = fn;
			this.context = context;
			this.once = once || false;
		}

		/**
		 * Minimal `EventEmitter` interface that is molded against the Node.js
		 * `EventEmitter` interface.
		 *
		 * @constructor
		 * @api public
		 */
		function EventEmitter() {
			this._events = new Events();
			this._eventsCount = 0;
		}

		/**
		 * Return an array listing the events for which the emitter has registered
		 * listeners.
		 *
		 * @returns {Array}
		 * @api public
		 */
		EventEmitter.prototype.eventNames = function eventNames() {
			var names = []
				, events
				, name;

			if (this._eventsCount === 0) return names;

			for (name in (events = this._events)) {
				if (has.call(events, name)) names.push(prefix ? name.slice(1) : name);
			}

			if (Object.getOwnPropertySymbols) {
				return names.concat(Object.getOwnPropertySymbols(events));
			}

			return names;
		};

		/**
		 * Return the listeners registered for a given event.
		 *
		 * @param {String|Symbol} event The event name.
		 * @param {Boolean} exists Only check if there are listeners.
		 * @returns {Array|Boolean}
		 * @api public
		 */
		EventEmitter.prototype.listeners = function listeners(event, exists) {
			var evt = prefix ? prefix + event : event
				, available = this._events[evt];

			if (exists) return !!available;
			if (!available) return [];
			if (available.fn) return [available.fn];

			for (var i = 0, l = available.length, ee = new Array(l); i < l; i++) {
				ee[i] = available[i].fn;
			}

			return ee;
		};

		/**
		 * Calls each of the listeners registered for a given event.
		 *
		 * @param {String|Symbol} event The event name.
		 * @returns {Boolean} `true` if the event had listeners, else `false`.
		 * @api public
		 */
		EventEmitter.prototype.emit = function emit(event, a1, a2, a3, a4, a5) {
			var evt = prefix ? prefix + event : event;

			if (!this._events[evt]) return false;

			var listeners = this._events[evt]
				, len = arguments.length
				, args
				, i;

			if (listeners.fn) {
				if (listeners.once) this.removeListener(event, listeners.fn, undefined, true);

				switch (len) {
					case 1: return listeners.fn.call(listeners.context), true;
					case 2: return listeners.fn.call(listeners.context, a1), true;
					case 3: return listeners.fn.call(listeners.context, a1, a2), true;
					case 4: return listeners.fn.call(listeners.context, a1, a2, a3), true;
					case 5: return listeners.fn.call(listeners.context, a1, a2, a3, a4), true;
					case 6: return listeners.fn.call(listeners.context, a1, a2, a3, a4, a5), true;
				}

				for (i = 1, args = new Array(len -1); i < len; i++) {
					args[i - 1] = arguments[i];
				}

				listeners.fn.apply(listeners.context, args);
			} else {
				var length = listeners.length
					, j;

				for (i = 0; i < length; i++) {
					if (listeners[i].once) this.removeListener(event, listeners[i].fn, undefined, true);

					switch (len) {
						case 1: listeners[i].fn.call(listeners[i].context); break;
						case 2: listeners[i].fn.call(listeners[i].context, a1); break;
						case 3: listeners[i].fn.call(listeners[i].context, a1, a2); break;
						case 4: listeners[i].fn.call(listeners[i].context, a1, a2, a3); break;
						default:
							if (!args) for (j = 1, args = new Array(len -1); j < len; j++) {
								args[j - 1] = arguments[j];
							}

							listeners[i].fn.apply(listeners[i].context, args);
					}
				}
			}

			return true;
		};

		/**
		 * Add a listener for a given event.
		 *
		 * @param {String|Symbol} event The event name.
		 * @param {Function} fn The listener function.
		 * @param {Mixed} [context=this] The context to invoke the listener with.
		 * @returns {EventEmitter} `this`.
		 * @api public
		 */
		EventEmitter.prototype.on = function on(event, fn, context) {
			var listener = new EE(fn, context || this)
				, evt = prefix ? prefix + event : event;

			if (!this._events[evt]) this._events[evt] = listener, this._eventsCount++;
			else if (!this._events[evt].fn) this._events[evt].push(listener);
			else this._events[evt] = [this._events[evt], listener];

			return this;
		};

		/**
		 * Add a one-time listener for a given event.
		 *
		 * @param {String|Symbol} event The event name.
		 * @param {Function} fn The listener function.
		 * @param {Mixed} [context=this] The context to invoke the listener with.
		 * @returns {EventEmitter} `this`.
		 * @api public
		 */
		EventEmitter.prototype.once = function once(event, fn, context) {
			var listener = new EE(fn, context || this, true)
				, evt = prefix ? prefix + event : event;

			if (!this._events[evt]) this._events[evt] = listener, this._eventsCount++;
			else if (!this._events[evt].fn) this._events[evt].push(listener);
			else this._events[evt] = [this._events[evt], listener];

			return this;
		};

		/**
		 * Remove the listeners of a given event.
		 *
		 * @param {String|Symbol} event The event name.
		 * @param {Function} fn Only remove the listeners that match this function.
		 * @param {Mixed} context Only remove the listeners that have this context.
		 * @param {Boolean} once Only remove one-time listeners.
		 * @returns {EventEmitter} `this`.
		 * @api public
		 */
		EventEmitter.prototype.removeListener = function removeListener(event, fn, context, once) {
			var evt = prefix ? prefix + event : event;

			if (!this._events[evt]) return this;
			if (!fn) {
				if (--this._eventsCount === 0) this._events = new Events();
				else delete this._events[evt];
				return this;
			}

			var listeners = this._events[evt];

			if (listeners.fn) {
				if (
					listeners.fn === fn
					&& (!once || listeners.once)
					&& (!context || listeners.context === context)
				) {
					if (--this._eventsCount === 0) this._events = new Events();
					else delete this._events[evt];
				}
			} else {
				for (var i = 0, events = [], length = listeners.length; i < length; i++) {
					if (
						listeners[i].fn !== fn
						|| (once && !listeners[i].once)
						|| (context && listeners[i].context !== context)
					) {
						events.push(listeners[i]);
					}
				}

				//
				// Reset the array, or remove it completely if we have no more listeners.
				//
				if (events.length) this._events[evt] = events.length === 1 ? events[0] : events;
				else if (--this._eventsCount === 0) this._events = new Events();
				else delete this._events[evt];
			}

			return this;
		};

		/**
		 * Remove all listeners, or those of the specified event.
		 *
		 * @param {String|Symbol} [event] The event name.
		 * @returns {EventEmitter} `this`.
		 * @api public
		 */
		EventEmitter.prototype.removeAllListeners = function removeAllListeners(event) {
			var evt;

			if (event) {
				evt = prefix ? prefix + event : event;
				if (this._events[evt]) {
					if (--this._eventsCount === 0) this._events = new Events();
					else delete this._events[evt];
				}
			} else {
				this._events = new Events();
				this._eventsCount = 0;
			}

			return this;
		};

//
// Alias methods names because people roll like that.
//
		EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
		EventEmitter.prototype.addListener = EventEmitter.prototype.on;

//
// This function doesn't apply anymore.
//
		EventEmitter.prototype.setMaxListeners = function setMaxListeners() {
			return this;
		};

//
// Expose the prefix.
//
		EventEmitter.prefixed = prefix;

//
// Allow `EventEmitter` to be imported as module namespace.
//
		EventEmitter.EventEmitter = EventEmitter;

//
// Expose the module.
//
		return EventEmitter
	}())

	var Protocol = {

		CONTENT_TYPE_JSON: 27,

		versionFields: {
			'28': ['version', 'streamId', 'streamPartition', 'timestamp', 'ttl', 'offset', 'previousOffset', 'contentType', 'content']
		},

		browserMessageTypes: ['b', 'u', 'subscribed', 'unsubscribed', 'resending', 'resent', 'no_resend'],

		decodeBrowserWrapper: function(rawMsg) {
			var jsonMsg = JSON.parse(rawMsg)
			var version = jsonMsg[0]
			if (version !== 0) {
				throw "Unknown message version: "+version
			}

			return {
				type: this.browserMessageTypes[jsonMsg[1]],
				subId: jsonMsg[2],
				msg: jsonMsg[3]
			}
		},

		decodeMessage: function(type, message) {
			if (typeof message === 'string') {
				message = JSON.parse(message)
			}

			// Stream content needs to be decoded further
			if (type === 'b' || type === 'u') {
				if (this.versionFields[message[0]] === undefined) {
					throw "Unsupported version: " + message[0]
				} else {
					var result = {}
					var fields = this.versionFields[message[0]]
					var contentType
					for (var i = 0; i < message.length; i++) {

						// Parse content if necessary
						if (fields[i] === 'content') {
							if (result.contentType === this.CONTENT_TYPE_JSON) {
								message[i] = JSON.parse(message[i])
							} else {
								throw "Unknown content type: " + result.contentType
							}
						}

						result[fields[i]] = message[i]
					}
					return result
				}
			} else {
				return message
			}
		},

		createSubscribeRequest: function(stream, resendOptions) {
			var req = {
				channel: stream
			}
			Object.keys(resendOptions).forEach(function(key) {
				req[key] = resendOptions[key]
			})
			return req
		}
	}

	/**
	 * Socket
	 */
	function Connection(options) {
		EventEmitter.call(this);
		if (!options.url) {
			throw "Server is not defined!"
		}
		this.options = options
		this.connected = false
		this.connecting = false
		this.disconnecting = false

		if (options.autoConnect) {
			this.connect()
		}
	}

	Object.keys(EventEmitter.prototype).forEach(function(it) {
		Connection.prototype[it] = EventEmitter.prototype[it]
	})

	Connection.prototype.connect = function() {
		var _this = this

		if (!(this.connected || this.connecting)) {
			this.connecting = true

			this.socket = new WebSocket(this.options.url)
			this.socket.binaryType = 'arraybuffer';
			_this.emit('connecting')

			this.socket.onopen = function() {
				debug("Connected to ", _this.options.url)
				_this.connected = true
				_this.connecting = false
				_this.emit('connected')
			}

			this.socket.onclose = function() {
				if (!_this.disconnecting) {
					debug("Connection lost. Attempting to reconnect")
					setTimeout(function() {
						_this.connect()
					}, 2000)
				} else {
					_this.disconnecting = false
				}

				_this.connected = false
				_this.connecting = false
				_this.emit('disconnected')
			}

			this.socket.onmessage = function(messageEvent) {
				var decoded = Protocol.decodeBrowserWrapper(messageEvent.data)
				_this.emit(decoded.type, Protocol.decodeMessage(decoded.type, decoded.msg), decoded.subId)
			}
		}
	}

	Connection.prototype.disconnect = function() {
		if (this.socket !== undefined && (this.connected || this.connecting)) {
			this.disconnecting = true
			this.socket.close()
		}
	}

	Connection.prototype.send = function(req) {
		this.socket.send(JSON.stringify(req))
	}

	/**
	 * Subscription
     */
	var subId = 0
	function generateSubscriptionId() {
		var id = subId++
		return id.toString()
	};

	function Subscription(streamId, callback, options) {
		EventEmitter.call(this); // call parent constructor

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
		this.subscribing = false
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

		this.on('subscribed', function() {
			debug("Sub %s subscribed to stream: %s", _this.id, _this.streamId)
			_this.subscribed = true
			_this.subscribing = false
		})

		this.on('unsubscribed', function() {
			debug("Sub %s unsubscribed: %s", _this.id, _this.streamId)
			_this.subscribed = false
			_this.subscribing = false
			_this.unsubscribing = false
			_this.resending = false
		})

		this.on('resending', function(response) {
			debug("Sub %s resending: %o", _this.id, response)
			// _this.resending = true was set elsewhere before making the request
		})

		this.on('no_resend', function(response) {
			debug("Sub %s no_resend: %o", _this.id, response)
			_this.resending = false
			_this.checkQueue()
		})

		this.on('resent', function(response) {
			debug("Sub %s resent: %o", _this.id, response)
			_this.resending = false
			_this.checkQueue()
		})

		this.on('connected', function() {

		})

		this.on('disconnected', function() {
			_this.subscribed = false
			_this.subscribing = false
			_this.resending = false
		})

	}

	// Subscription extends EventEmitter
	Object.keys(EventEmitter.prototype).forEach(function(it) {
		Subscription.prototype[it] = EventEmitter.prototype[it]
	})

	Subscription.prototype.handleMessage = function(msg, isResend) {
		var content = msg.content
		var timestamp = msg.timestamp
		var offset = msg.offset
		var previousOffset = msg.previousOffset

		if (previousOffset == null) {
			debug("handleMessage: prevOffset is null, gap detection is impossible! message: %o", msg)
		}

		// TODO: check this.options.resend_last ?
		// If resending, queue broadcasted messages
		if (this.resending && !isResend) {
			this.queue.push(msg)
		} else {
			// Gap check
			if (previousOffset != null && 					// previousOffset is required to check for gaps
				this.lastReceivedOffset != null &&  		// and we need to know what msg was the previous one
				previousOffset > this.lastReceivedOffset &&	// previous message had larger offset than our previous msg => gap!
				!this.resending) {

				// Queue the message to be processed after resend
				this.queue.push(msg)

				var from = this.lastReceivedOffset + 1
				var to = previousOffset
				debug("Gap detected, requesting resend for stream %s from %d to %d", this.streamId, from, to)
				this.emit('gap', from, to)
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
					this.emit('done')
				}
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
				this.handleMessage(msg, false)
			}

			this.queue = []
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
		EventEmitter.call(this); // call parent constructor

		// Default options
		this.options = {
			// The server to connect to
			url: "wss://data.streamr.com/api/v1/ws",
			path: "/api/v1/ws",
			// Automatically connect on first subscribe
			autoConnect: true,
			// Automatically disconnect on last unsubscribe
			autoDisconnect: true
		}
		this.subsByStream = {}
		this.subById = {}

		this.connection = null
		this.connected = false

		extend(this.options, options || {})
	}

	// StreamrClient extends EventEmitter
	Object.keys(EventEmitter.prototype).forEach(function(it) {
		StreamrClient.prototype[it] = EventEmitter.prototype[it]
	})

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
		sub.on('gap', function(from, to) {
			_this._requestResend(sub, {resend_from: from, resend_to: to})
		})
		sub.on('done', function() {
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
			sub.emit('unsubscribed')
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

		debug("Connecting to %s", this.options.url)
		this.connecting = true
		this.disconnecting = false

		this.connection = new Connection(this.options)

		// Broadcast messages to all subs listening on stream
		this.connection.on('b', function(msg) {
			// Notify the Subscriptions for this stream. If this is not the message each individual Subscription
			// is expecting, they will either ignore it or request resend via gap event.
			var streamId = msg.streamId
			var subs = _this.subsByStream[streamId]
			if (subs) {
				for (var i=0;i<subs.length;i++)
					subs[i].handleMessage(msg, false)
			}
			else {
				debug('WARN: message received for stream with no subscriptions: %s', streamId)
			}
		})

		// Unicast messages to a specific subscription only
		this.connection.on('u', function(msg, sub) {
			if (sub !== undefined && _this.subById[sub] !== undefined) {
				_this.subById[sub].handleMessage(msg, true)
			}
			else {
				debug('WARN: subscription not found for stream: %s, sub: %s', msg.streamId, sub)
			}
		})

		this.connection.on('subscribed', function(response) {
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
					sub.emit('subscribed')
				})
			}
		})

		this.connection.on('unsubscribed', function(response) {
			debug("Client unsubscribed: %o", response)

			if (_this.subsByStream[response.channel]) {
				// Copy the list to avoid concurrent modifications
				var l = _this.subsByStream[response.channel].slice()
				l.forEach(function(sub) {
					_this._removeSubscription(sub)
					sub.emit('unsubscribed')
				})
			}

			_this._checkAutoDisconnect()
		})

		// Route resending state messages to corresponding Subscriptions
		this.connection.on('resending', function(response) {
			if (_this.subById[response.sub]) {
				_this.subById[response.sub].emit('resending', response)
			} else {
				debug('resent: Subscription %d is gone already', response.sub)
			}
		})

		this.connection.on('no_resend', function(response) {
			if (_this.subById[response.sub]) {
				_this.subById[response.sub].emit('no_resend', response)
			} else {
				debug('resent: Subscription %d is gone already', response.sub)
			}
		})

		this.connection.on('resent', function(response) {
			if (_this.subById[response.sub]) {
				_this.subById[response.sub].emit('resent', response)
			} else {
				debug('resent: Subscription %d is gone already', response.sub)
			}
		})

		// On connect/reconnect, send pending subscription requests
		this.connection.on('connected', function() {
			debug("Connected!")
			_this.connected = true
			_this.connecting = false
			_this.disconnecting = false
			_this.emit('connected')

			Object.keys(_this.subsByStream).forEach(function(streamId) {
				var subs = _this.subsByStream[streamId]
				subs.forEach(function(sub) {
					if (!sub.isSubscribed()) {
						_this._resendAndSubscribe(sub)
					}
				})
			})
		})

		this.connection.on('disconnected', function() {
			debug("Disconnected.")
			_this.connected = false
			_this.connecting = false
			_this.disconnecting = false
			_this.emit('disconnected')

			Object.keys(_this.subsByStream).forEach(function(streamId) {
				var subs = _this.subsByStream[streamId]
				delete subs._subscribing
				subs.forEach(function(sub) {
					sub.emit('disconnected')
				})
			})
		})

		this.connection.connect() // TODO: i did not find this anywhere else?
		return this.subsByStream
	}

	StreamrClient.prototype.pause = function() {
		this.connection.disconnect()
	}

	StreamrClient.prototype.disconnect = function() {
		var _this = this
		this.connecting = false
		this.disconnecting = true

		Object.keys(this.subsByStream).forEach(function(streamId) {
			_this.unsubscribeAll(streamId)
		})

		this.connection.disconnect()
	}

	StreamrClient.prototype._checkAutoDisconnect = function() {
		// Disconnect if no longer subscribed to any channels
		if (this.options.autoDisconnect && Object.keys(this.subsByStream).length === 0) {
			debug("Disconnecting due to no longer being subscribed to any channels")
			this.disconnect()
		}
	}

	StreamrClient.prototype._resendAndSubscribe = function(sub) {
		var _this = this

		if (!sub.subscribing && !sub.resending) {
			sub.subscribing = true
			_this._requestSubscribe(sub)

			// Once subscribed, ask for a resend
			sub.once('subscribed', function() {
				if (sub.hasResendOptions()) {
					_this._requestResend(sub)
				}
			})
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
			var req = extend({}, sub.options, {type: 'subscribe', channel: sub.streamId})
			debug("_requestSubscribe: subscribing client: %o", req)
			subs._subscribing = true
			_this.connection.send(req)
		}
		// If there already is a subscribed subscription for this stream, this new one will just join it immediately
		else if (subscribedSubs.length > 0) {
			debug('_requestSubscribe: another subscription for same stream: %s, insta-subscribing', sub.streamId)

			setTimeout(function() {
				sub.emit('subscribed')
			}, 0)
		}
	}

	StreamrClient.prototype._requestUnsubscribe = function(streamId) {
		debug("Client unsubscribing stream %o", streamId)
		this.connection.send({
			type: 'unsubscribe',
			channel: streamId
		})
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

		var request = extend({}, options, resendOptions, {type: 'resend', channel: sub.streamId, sub: sub.id})
		debug("_requestResend: %o", request)
		this.connection.send(request)
	}

	StreamrClient.prototype.handleError = function(msg) {
		debug(msg)
		this.emit('error', msg)
	}

	if (typeof module !== 'undefined' && module.exports)
		module.exports = StreamrClient
	else window.StreamrClient = StreamrClient

})(typeof(exports) !== 'undefined' ? exports : window)