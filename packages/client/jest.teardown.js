// eslint-disable-next-line import/no-extraneous-dependencies
const { KeyServer } = require('streamr-test-utils')

export default async () => {
    await KeyServer.stopIfRunning()
}
