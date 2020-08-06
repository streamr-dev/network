const ethers = require('ethers')

function authenticateFromConfig(ethereumConfig, log = console.info) {
    let wallet = {}
    if (ethereumConfig.privateKey) {
        log('Ethereum Authentication with private key')
        wallet = new ethers.Wallet(ethereumConfig.privateKey)
    } else if (ethereumConfig.generateWallet) {
        log('Ethereum authentication with new randomly generated wallet')
        wallet = ethers.Wallet.createRandom()
    } else {
        log('Ethereum authentication disabled')
    }
    return wallet.address
}

module.exports = {
    authenticateFromConfig
}
