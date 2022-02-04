const { KeyServer } = require('streamr-test-utils')

export default async () => {
    await KeyServer.stopIfRunning()
}
