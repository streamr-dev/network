// In browsers, the ws package is replaced with this to use native websockets

let ws

if (typeof WebSocket !== 'undefined') {
    ws = WebSocket
} else {
    ws = window.WebSocket
}

module.exports = ws
