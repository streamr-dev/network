const portfinder = require('portfinder')

const LOCALHOST = '127.0.0.1'

const getPort = async () => portfinder.getPortPromise()

module.exports = {
    getPort,
    LOCALHOST,
}
