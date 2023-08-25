import { fastWallet } from '@streamr/test-utils'
import { Wallet } from 'ethers'
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
                    operatorContractAddress: '0x139dfa493a45364b598f2f98e504192819082c85'
                }
            }
        })
        await promise
    })
})
