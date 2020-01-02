// NB: THIS FILE MUST BE IN ES5

// In browsers, the ws package is replaced with this to use native websockets
export default typeof WebSocket !== 'undefined' ? WebSocket : window.WebSocket
