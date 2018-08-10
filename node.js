'use strict'

const Peer = require('./src/peer').Peer
const port = process.argv[2] || 30301

const peer = new Peer({host: '127.0.0.1', port: port});