import { Wallet } from 'ethers'
import { fastWallet } from '@streamr/test-utils'

import { Broker } from '../../../../src/broker'
import { startBroker } from '../../../utils'

describe('MinerPlugin', () => {
    let brokerWallet: Wallet
    let broker: Broker

    beforeEach(async () => {
        brokerWallet = fastWallet()
    })

    afterEach(async () => {
        await Promise.allSettled([
            broker?.stop(),
        ])
    })

    it('can start broker with miner plugin', async () => {
        const promise = startBroker({
            privateKey: brokerWallet.privateKey,
            trackerPort: 12345,
            extraPlugins: {
                miner: {}
            }
        })
        await expect(promise).toResolve()
        broker = await promise
    })
})
