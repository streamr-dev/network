const os = require('os')
const uuidV1 = require('uuid/v1')
const PeerInfo = require('peer-info')
const { version } = require('../package.json')

const callbackToPromise = (method, ...args) => {
    return new Promise((resolve, reject) => {
        return method(...args, (err, result) => {
            return err ? reject(err) : resolve(result)
        })
    })
}

const BOOTNODES = require('../bootstrapNodes.json').map((node) => node.path)

const getStreams = (amount = 3) => {
    const streams = []

    for (let i = 0; i < amount; i++) {
        streams.push(uuidV1())
    }

    return streams
}
// this.peerInfo.id.toB58String()
const getAddress = (peerInfo) => {
    if (peerInfo instanceof PeerInfo) {
        return peerInfo.multiaddrs.toArray()[0].toString()
    }
    throw new Error('Expected instance of PeerInfo')
}

const generateClientId = (prefix = '') => {
    const prefixFixed = prefix ? '-' + prefix : ''
    return `streamr${prefixFixed}/v${version}/${os.platform()}-${os.arch()}/nodejs`
}

const isTracker = (tracker) => BOOTNODES.includes(tracker)

module.exports = {
    callbackToPromise,
    getStreams,
    getAddress,
    generateClientId,
    isTracker,
    BOOTNODES
}
