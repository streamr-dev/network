'use strict'

const Tracker = require('./src/tracker')
const ms = require('ms')

const tracker = new Tracker({host: '127.0.0.1', port: 30300});

setInterval(() => {
    const peersCount = tracker.getPeers().length
    // const peersCount = dpt.getPeers().length
    // const openSlots = rlpx._getOpenSlots()
    // const queueLength = rlpx._peersQueue.length
    // const queueLength2 = rlpx._peersQueue.filter((o) => o.ts <= Date.now()).length
  
    console.log(`Total nodes in tracker: ${peersCount}`)
  }, ms('10s'))