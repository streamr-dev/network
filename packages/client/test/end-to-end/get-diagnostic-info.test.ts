import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { StreamPermission } from '../../src/permission'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { getCreateClient, createTestClient } from '../test-utils/utils'
import { KEYSERVER_PORT } from '../../src/ConfigTest'

describe('getDiagnosticInfo', () => {
    let client: StreamrClient
    let otherClient: StreamrClient
    let stream: Stream
    const createClient = getCreateClient()

    beforeAll(async () => {
        const streamPath = `/get-diagnostic-info.test.ts/${Date.now()}`
        client = createTestClient(await fetchPrivateKeyWithGas(KEYSERVER_PORT))
        stream = await client.createStream(streamPath)
        await stream.grantPermissions({ permissions: [StreamPermission.SUBSCRIBE], public: true })
        otherClient = await createClient()
        await client.subscribe(stream.id)
        await otherClient.subscribe(stream.id)
    }, 30 * 1000)

    afterAll(async () => {
        await Promise.all([
            client.destroy(),
            otherClient.destroy()
        ])
    })

    it('does not reject', async () => {
        await expect(client.getDiagnosticInfo()).toResolve()
    })
})
