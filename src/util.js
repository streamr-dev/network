const callbackToPromise = (method, ...args) => {
    return new Promise((resolve, reject) => {
        return method(...args, (err, result) => {
            return err ? reject(err) : resolve(result)
        })
    })
}

const BOOTNODES = require('../bootstrapNodes.json').map((node) => node.path)

// TODO remove both
const getAddress = (peerInfo) => peerInfo

const getIdShort = (input) => input
// (input.length > 15 ? input.slice(-4) : input)

module.exports = {
    callbackToPromise,
    getAddress,
    getIdShort,
    BOOTNODES
}
