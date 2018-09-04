const Peer = require('./src/logic/peer')
const ms = require('ms')
const port = process.argv[2] || 30301

const peer = new Peer({
    host: '127.0.0.1',
    port: port
})

setInterval(() => {
    const nodesConnected = peer.getNodes().length

    console.log(`Total nodes connected: ${nodesConnected}`)
}, ms('10s'))
