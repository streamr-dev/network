import { Tracker } from 'streamr-network'
import { Wallet } from 'ethers'
import { createClient, getPrivateKey, startBroker } from '../../../utils'
import { Broker } from "../../../../src/broker"
import StreamrClient from 'streamr-client'

const httpPort1 = 12501
const wsPort1 = 12502
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
        storageNodeAccount = new Wallet(await getPrivateKey())
        const engineAndEditorAccount = Wallet.createRandom()
        const trackerInfo = tracker.getConfigRecord()
        const storageNodeClient = await createClient(tracker, storageNodeAccount.privateKey)
        await storageNodeClient.setNode(`{"http": "http://127.0.0.1:${httpPort1}/api/v1"}`)

        storageNode = await startBroker({
            name: 'storageNode',
            privateKey: storageNodeAccount.privateKey,
            trackerPort,
            wsPort: wsPort1,
            httpPort: httpPort1,
            enableCassandra: true,
            streamrAddress: engineAndEditorAccount.address,
        })
    })

    afterAll(async () => {
        await tracker?.stop()
        await storageNode?.stop()
        await storageNodeClient?.stop()
    })

    it('has node id same as address', async () => {
        expect(storageNode.getNodeId()).toEqual(storageNodeAccount.address)
    })
})
