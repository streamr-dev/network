process.once("loaded", () => {

	let WebSocket = require('ws')
	let uWS = require('@streamr/uws-js-unofficial')

	window.WebSocket = WebSocket
	window.uWS = uWS

	window._streamr_electron_test = true
})
