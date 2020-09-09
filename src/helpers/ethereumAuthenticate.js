const ethers = require('ethers')

const logger = require('./logger')('streamr:helpers:authenticateFromConfig')

function authenticateFromConfig(ethereumConfig) {
    let wallet = {}
    if (ethereumConfig.privateKey) {
        logger.info('Ethereum Authentication with private key')
        wallet = new ethers.Wallet(ethereumConfig.privateKey)
    } else if (ethereumConfig.generateWallet) {
        logger.info('Ethereum authentication with new randomly generated wallet')
        wallet = ethers.Wallet.createRandom()
    } else {
        logger.info('Ethereum authentication disabled')
    }
    return wallet.address
}

module.exports = {
    authenticateFromConfig
}
