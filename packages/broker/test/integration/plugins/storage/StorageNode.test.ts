import { Tracker } from 'streamr-network'
import { Wallet } from 'ethers'
import { startBroker, startTestTracker } from '../../../utils'
import { Broker } from "../../../../src/broker"

const httpPort1 = 12501
const wsPort1 = 12502
const trackerPort = 12503

describe('StorageNode', () => {
    let tracker: Tracker
    let storageNode: Broker
    const storageNodeAccount = Wallet.createRandom()

    beforeAll(async () => {
        tracker = await startTestTracker(trackerPort)
    })

    beforeAll(async () => {
        const storageNodeRegistry = [{
            address: storageNodeAccount.address,
            url: `http://127.0.0.1:${httpPort1}`
        }]
        const engineAndEditorAccount = Wallet.createRandom()
        storageNode = await startBroker({
            name: 'storageNode',
            privateKey: storageNodeAccount.privateKey,
            trackerPort,
            wsPort: wsPort1,
            enableCassandra: true,
            streamrAddress: engineAndEditorAccount.address,
            storageNodeRegistry
        })
    })

    afterAll(async () => {
        await tracker?.stop()
        await storageNode?.stop()
    })

    it('has node id same as address', async () => {
        expect(storageNode.getNodeId()).toEqual(storageNodeAccount.address)
    })
})
