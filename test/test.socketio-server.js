var assert = require('assert'),
	mockery = require('mockery')
	SocketIoServer = require('../lib/socketio-server').SocketIoServer

describe('socketio-server', function () {

	var server

	before(function() {
		mockery.enable()
	})

	after(function() {
		mockery.disable()
	})

	beforeEach(function() {
		mockery.registerMock('socket.io', {

		})

		server = new SocketIoServer('invalid-zookeeper-addr', 0)
	});

	afterEach(function() {
		mockery.deregisterMock('socket.io')
	});

	it('should do something', function (done) {

	});

});