var assert = require('assert')
var Connection = require('../lib/connection.js')

describe('Connection', function () {

	var connection

	beforeEach(function() {
		connection = new Connection("id", {})	
	})

	describe('addRoom', function() {
		it('should add the given rooms to rooms array', function() {
			connection.addRoom("room")
			assert.equal(connection.getRooms().length, 1)
			assert.equal(connection.getRooms()[0], "room")
			connection.addRoom("room2")
			assert.equal(connection.getRooms().length, 2)
			assert.equal(connection.getRooms()[1], "room2")
		})
	})

	describe('removeRoom', function() {
		beforeEach(function() {
			connection.addRoom("room")
			connection.addRoom("room2")
		})

		it('should remove the given room from rooms array', function() {
			connection.removeRoom("room")
			assert.equal(connection.getRooms().length, 1)
			assert.equal(connection.getRooms()[0], "room2")
			connection.removeRoom("room2")
			assert.equal(connection.getRooms().length, 0)
		})
	})

	describe('getRooms', function() {
		beforeEach(function() {
			connection.addRoom("room")
			connection.addRoom("room2")
		})

		it('should return a copy of the rooms array', function() {
			var rooms = connection.getRooms()
			assert.equal(rooms.length, 2)
			// Modify the copy
			rooms.push("foo")
			assert.equal(rooms.length, 3)
			assert.equal(connection.getRooms().length, 2)
		})
	})

});