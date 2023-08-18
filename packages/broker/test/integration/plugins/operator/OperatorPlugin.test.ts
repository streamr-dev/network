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
            extraPlugins: {
                operator: {
                    operatorContractAddress: '0xb3b557d705c07a605d24fa7e4caaa468fc25a596'
                }
            }
        })
        await promise
    })
})
