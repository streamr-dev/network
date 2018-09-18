const localhost = '127.0.0.1'
const { createEndpoint } = require('../src/connection/Libp2pEndpoint')

const getTestEndpoints = async (numEndpoints, basePort) => {
    const endpoints = []

    for (let i = 0; i < numEndpoints; i++) {
        // eslint-disable-next-line no-await-in-loop
        const endpoint = await createEndpoint(localhost, basePort + i, '', true).catch((err) => { throw err })
        endpoints.push(endpoint)
    }

    return endpoints
}

const getPeers = (max) => Array.from(Array(max), (d, i) => 'address-' + i)

module.exports = {
    getTestEndpoints,
    getPeers
}
