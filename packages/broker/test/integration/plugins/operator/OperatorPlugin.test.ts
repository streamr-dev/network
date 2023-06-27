import { Wallet } from 'ethers'
import { fastWallet } from '@streamr/test-utils'

import { Broker } from '../../../../src/broker'
import { startBroker } from '../../../utils'

describe('OperatorPlugin', () => {
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

    it('can start broker with operator plugin', async () => {
        const promise = startBroker({
            privateKey: brokerWallet.privateKey,
            trackerPort: 12345,
            extraPlugins: {
                operator: {
                    operatorContractAddress: '0x4A5C0EC07F7ddBd4B6050181638e24b0153991b2'
                }
            }
        })
        await promise
    })
})
