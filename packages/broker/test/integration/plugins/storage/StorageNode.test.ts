import { Tracker } from 'streamr-network-tracker'
import { Wallet } from 'ethers'
import { createClient, fetchPrivateKeyWithGas, startBroker, startTestTracker } from '../../../utils'
import { Broker } from "../../../../src/broker"
import StreamrClient from 'streamr-client'

const httpPort1 = 12501
const trackerPort = 12503

describe('StorageNode', () => {
    let tracker: Tracker
    let storageNode: Broker
    let storageNodeClient: StreamrClient
    let storageNodeAccount: Wallet

    beforeAll(async () => {
        tracker = await startTestTracker(trackerPort)
    })

    beforeAll(async () => {
        storageNodeAccount = new Wallet(await fetchPrivateKeyWithGas())
        const storageNodeClient = await createClient(tracker, storageNodeAccount.privateKey)
        await storageNodeClient.createOrUpdateNodeInStorageNodeRegistry(`{"http": "http://127.0.0.1:${httpPort1}"}`)

        storageNode = await startBroker({
            name: 'storageNode',
            privateKey: storageNodeAccount.privateKey,
            trackerPort,
            httpPort: httpPort1,
            enableCassandra: true
        })
    })

    afterAll(async () => {
        await tracker?.stop()
        await storageNode?.stop()
        await storageNodeClient?.stop()
    })

    it('has node id same as address', async () => {
        expect((await storageNode.getNode()).getNodeId()).toEqual(storageNodeAccount.address)
    })
})
