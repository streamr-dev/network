/* eslint-disable */
import { range, padStart } from 'lodash'
import { StreamrClient } from './StreamrClient'
import { ConfigTest } from './ConfigTest'
import { StreamPermission } from './permission'

const createPrivateKey = (i: number): string => {
    return `0x${padStart(String(i + 1), 64, '0')}`
}

const main = async () => {

    const GRANTERS = 50
    const USERS_PER_GRANTER = 50

    const mainClient = new StreamrClient({
        ...ConfigTest,
        auth: {
            privateKey: createPrivateKey(1)
        }
    })

    console.log('Create stream')
    const stream = await mainClient.createStream('/test/' + Date.now())
    console.log('Stream: ' + stream.id)

    const grantClients = range(GRANTERS).map((i) => {
        return new StreamrClient({
            ...ConfigTest,
            auth: {
                privateKey: createPrivateKey(i + 100)
            }
        })
    })
    const grantClientAddresses = await Promise.all(grantClients.map(c => c.getAddress()))
    const grantClientAssignments = grantClientAddresses.map(user => {
        return {
            user,
            permissions: [StreamPermission.GRANT]
        }
    })
    console.log('Grant grants')
    await mainClient.grantPermissions(stream.id, ...grantClientAssignments)

    await Promise.all(grantClients.map(async (client, j) => {
        for await (const i of range(USERS_PER_GRANTER)) {
            console.log('Grant ' + i + ' in ' + j)
            await client.grantPermissions(stream.id, {
                user: `0x${padStart(String(j * USERS_PER_GRANTER + i + 1), 40, '0')}`,
                permissions: [StreamPermission.PUBLISH, StreamPermission.SUBSCRIBE]
            })
        }
    }))

    console.log('Query')
    const permissions = await mainClient.getPermissions(stream.id)
    console.log('Permissions: ' + permissions.length)
    permissions.forEach((p, i) => {
        console.log(i + ': ' + JSON.stringify(p))
    })
}

main()
