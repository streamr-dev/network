import { Wallet } from 'ethers'
import {
    startStorageNode
} from '../../../utils'
import { Broker } from "../../../../src/broker"
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { toEthereumAddress } from '@streamr/utils'

const NETWORK_LAYER_PORT = 44404

describe('StorageNode', () => {
    let storageNode: Broker
    let storageNodeAccount: Wallet

    beforeAll(async () => {
        storageNodeAccount = new Wallet(await fetchPrivateKeyWithGas())
        storageNode = await startStorageNode(storageNodeAccount.privateKey, 1234, NETWORK_LAYER_PORT)
    }, 30 * 1000)

    afterAll(async () => {
        await storageNode?.stop()
    })

    it('has node id same as address', async () => {
        expect((await storageNode.getAddress())).toEqual(toEthereumAddress(storageNodeAccount.address))
    })
})
