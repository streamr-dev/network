const uuidV1 = require('uuid/v1')
const version = require('../package.json').version
const PeerInfo = require('peer-info')
const os = require('os')

const callbackToPromise = (method, ...args) => {
    return new Promise((resolve, reject) => {
        return method(...args, (err, result) => {
            return err ? reject(err) : resolve(result)
        })
    })
}

const BOOTNODES = require('../bootstrapNodes.json').map(node => {
    return node.path
})

const getStreams = (amount = 3) => {
    let streams = []

    for (let i = 0; i < amount; i++) {
        streams.push(uuidV1())
    }

    return streams
}
// this.peerInfo.id.toB58String()
const getAddress = peerInfo => {
    return peerInfo instanceof PeerInfo ? peerInfo.multiaddrs.toArray()[0].toString() : ''
}

const buildMessage = (code, data) => {
    return JSON.stringify({
        code: code,
        msg: data
    })
}

const generateClientId = (prefix = '') => {
    prefix = prefix ? '-' + prefix : ''
    return `streamr${prefix}/v${version}/${os.platform()}-${os.arch()}/nodejs`
}

const isTracker = tracker => BOOTNODES.includes(tracker)

module.exports = {
    callbackToPromise,
    getStreams,
    getAddress,
    buildMessage,
    generateClientId,
    isTracker,
    BOOTNODES
}
