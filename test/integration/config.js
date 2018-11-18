module.exports = {
    websocketUrl: process.env.WEBSOCKET_URL || 'ws://localhost:8890/api/v1/ws',
    restUrl: process.env.REST_URL || 'http://localhost:8081/streamr-core/api/v1',
}
