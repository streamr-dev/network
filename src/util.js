const os = require('os')
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

const getAddress = (peerInfo) => {
    if (peerInfo instanceof PeerInfo) {
        return peerInfo.multiaddrs.toArray()[0].toString()
    }
    throw new Error('Expected instance of PeerInfo, got ' + peerInfo)
}

const getId = (peerInfo) => {
    if (peerInfo instanceof PeerInfo) {
        return peerInfo.id.toB58String()
    }
    throw new Error('Expected instance of PeerInfo, got ' + peerInfo)
}

const getIdShort = (input) => (input instanceof PeerInfo ? getId(input) : input).slice(-4)

const generateClientId = (suffix) => `${suffix}/v${version}/${os.platform()}-${os.arch()}/nodejs`

const isTracker = (tracker) => BOOTNODES.includes(tracker)

const isNode = (peer) => !isTracker(peer)

module.exports = {
    callbackToPromise,
    getAddress,
    getId,
    getIdShort,
    generateClientId,
    isTracker,
    isNode,
    BOOTNODES
}
