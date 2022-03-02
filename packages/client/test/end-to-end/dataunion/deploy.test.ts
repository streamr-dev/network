import debug from 'debug'

import { StreamrClient } from '../../../src/StreamrClient'
import { ConfigTest } from '../../../src/ConfigTest'
import { createMockAddress } from '../../test-utils/utils'

const log = debug('StreamrClient::DataUnion::integration-test-deploy')

describe('DataUnion deploy', () => {

    let adminClient: StreamrClient

    beforeAll(async () => {
        log('ClientOptions: %O', ConfigTest)
        adminClient = new StreamrClient(ConfigTest as any)
    }, 60000)

    describe('owner', () => {

        it('not specified: defaults to deployer', async () => {
            const dataUnion = await adminClient.deployDataUnion()
            expect(await dataUnion.getAdminAddress().then((a) => a.toLowerCase())).toBe(await adminClient.getAddress())
        }, 60000)

        it('specified', async () => {
            const owner = createMockAddress()
            const dataUnion = await adminClient.deployDataUnion({ owner })
            expect(await dataUnion.getAdminAddress()).toBe(owner)
        }, 60000)

        it('invalid', () => {
            return expect(() => adminClient.deployDataUnion({ owner: 'foobar' })).rejects.toThrow('invalid address')
        }, 60000)

    })
})

