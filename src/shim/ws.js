// NB: THIS FILE MUST BE IN ES5

// In browsers, the ws package is replaced with this to use native websockets

if (typeof WebSocket !== 'undefined') {
    module.exports = WebSocket
} else {
    module.exports = window.WebSocket
}
