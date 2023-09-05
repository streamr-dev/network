import { Broker } from '../../../../src/broker'
import { startBroker } from '../../../utils'
import { setupOperatorContract } from './contractUtils'

describe('OperatorPlugin', () => {
    let broker: Broker

    afterEach(async () => {
        broker?.stop()
    })

    it('can start broker with operator plugin', async () => {
        const deployment = await setupOperatorContract({ nodeCount: 1 })
        broker = await startBroker({
            privateKey: deployment.nodeWallets[0].privateKey,
            extraPlugins: {
                operator: {
                    operatorContractAddress: deployment.operatorContract.address
                }
            }
        })
    }, 30 * 1000)
})
