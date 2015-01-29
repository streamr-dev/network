var assert = require('assert'),
	mockery = require('mockery')
	KafkaHelper = require('../lib/kafka-helper').KafkaHelper

describe('kafka-helper', function () {

	var kh

	before(function() {
		mockery.enable()
	})

	after(function() {
		mockery.disable()
	})

	beforeEach(function() {
		mockery.registerMock('kafka-node', {

		})

		kh = new KafkaHelper('invalid-zookeeper-addr')
	});

	afterEach(function() {
		mockery.deregisterMock('kafka-node')
	});

	it('should try to fetch offsets via kafka offset fetcher', function (done) {

	});

});