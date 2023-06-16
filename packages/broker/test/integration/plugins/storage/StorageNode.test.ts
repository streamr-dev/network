import { Wallet } from 'ethers'
import {
    startStorageNode
} from '../../../utils'
import { Broker } from "../../../../src/broker"
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { toEthereumAddress } from '@streamr/utils'

describe('StorageNode', () => {
    let storageNode: Broker
    let storageNodeAccount: Wallet

    beforeAll(async () => {
        storageNodeAccount = new Wallet(await fetchPrivateKeyWithGas())
        storageNode = await startStorageNode(storageNodeAccount.privateKey, 1234, 44404)
    }, 30 * 1000)

    afterAll(async () => {
        await storageNode?.stop()
    })

    it('has node id same as address', async () => {
        expect((await storageNode.getAddress())).toEqual(toEthereumAddress(storageNodeAccount.address))
    })
})
