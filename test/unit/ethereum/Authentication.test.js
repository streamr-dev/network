const logger = require('pino')()

const ethereumAuthenticate = require('../../../src/helpers/ethereumAuthenticate')

// Dev env 1 privateKey and address
const privateKey = '0xaa7a3b3bb9b4a662e756e978ad8c6464412e7eef1b871f19e5120d4747bce966'
const address = '0xde1112f631486CfC759A50196853011528bC5FA0'

describe('Ethereum authentication', () => {
    it('authenticates with a private key', () => {
        const config = {
            privateKey
        }
        const brokerAddress = ethereumAuthenticate.authenticateFromConfig(config, logger)
        expect(brokerAddress).toEqual(address)
    })
    it('authenticates with a randomly generated wallet', () => {
        const config = {
            generateWallet: true
        }
        const brokerAddress = ethereumAuthenticate.authenticateFromConfig(config, logger)
        expect(brokerAddress).not.toEqual(undefined)
    })
    it('skips authentication if necessary', () => {
        const config = {
            generateWallet: false
        }
        const brokerAddress = ethereumAuthenticate.authenticateFromConfig(config, logger)
        expect(brokerAddress).toEqual(undefined)
    })
})
