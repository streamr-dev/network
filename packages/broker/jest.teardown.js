const { KeyServer } = require('streamr-test-utils')

module.exports = async () => {
    await KeyServer.stopIfRunning()
}
