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
        broker?.stop()
    })

    it('can start broker with operator plugin', async () => {
        broker = await startBroker({
            privateKey: brokerWallet.privateKey,
            extraPlugins: {
                operator: {
                    operatorContractAddress: '0x139dfa493a45364b598f2f98e504192819082c85'
                }
            }
        })
    })
})
