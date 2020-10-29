const ethers = require('ethers')

function authenticateFromConfig(ethereumConfig) {
    let wallet = {}
    if (ethereumConfig.privateKey) {
        wallet = new ethers.Wallet(ethereumConfig.privateKey)
    } else if (ethereumConfig.generateWallet) {
        wallet = ethers.Wallet.createRandom()
    }
    return wallet.address
}

module.exports = {
    authenticateFromConfig
}
