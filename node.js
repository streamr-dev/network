const Connection = require('./src/connection/Connection')
const Node = require('./src/logic/Node')

const port = process.argv[2] || 30301
// const ms = require('ms')

const connection = new Connection('127.0.0.1', port, '', true)
const node = new Node(connection)

// setInterval(() => {
//     const nodesConnected = peer.getNodes().length

//     console.log(`Total nodes connected: ${nodesConnected}`)
// }, ms('10s'))
