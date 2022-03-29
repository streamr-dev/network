import { Tracker } from '@streamr/network-tracker'
import { Wallet } from 'ethers'
import {
    fetchPrivateKeyWithGas,
    startStorageNode,
    startTestTracker
} from '../../../utils'
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
        storageNode = await startStorageNode(storageNodeAccount.privateKey, httpPort1, trackerPort)
    }, 30 * 1000)

    afterAll(async () => {
        await tracker?.stop()
        await storageNode?.stop()
        await storageNodeClient?.stop()
    })

    it('has node id same as address', async () => {
        expect((await storageNode.getNode()).getNodeId()).toEqual(storageNodeAccount.address)
    })
})
