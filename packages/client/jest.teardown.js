// eslint-disable-next-line import/no-extraneous-dependencies
const { KeyServer } = require('streamr-test-utils')

module.exports = async () => {
    await KeyServer.stopIfRunning()
}
