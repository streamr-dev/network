// eslint-disable-next-line import/no-extraneous-dependencies
import { KeyServer } from '@streamr/test-utils'

export default async function teardown(): Promise<void> {
    await KeyServer.stopIfRunning()
}
