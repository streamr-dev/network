import { Chains } from '@streamr/config'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { Wallet } from 'ethers'
import { ProxyDirection } from 'streamr-client'
import { Broker } from '../../../../src/broker'
import { createClient, createTestStream, startBroker } from '../../../utils'
import { createWalletAndDeployOperator } from './createWalletAndDeployOperator'
import { getProvider } from './smartContractUtils'

const config = Chains.load()["dev1"]
const theGraphUrl = `http://${process.env.STREAMR_DOCKER_DEV_HOST ?? '127.0.0.1'}:8000/subgraphs/name/streamr-dev/network-subgraphs`

describe('OperatorPlugin', () => {
    let broker: Broker
    let brokerWallet: Wallet
    let operatorContractAddress: string

    beforeAll(async () => {
        const deployment = (await setupOperatorContract({
            provider: getProvider(), 
            chainConfig, 
            theGraphUrl
        }))
        brokerWallet = deployment.operatorWallet
        operatorContractAddress = deployment.operatorContract.address
    }, 30 * 1000)

    afterEach(async () => {
        await Promise.allSettled([
            broker?.stop(),
        ])
    })

    it('can start broker with operator plugin', async () => {
        broker = await startBroker({
            privateKey: brokerWallet.privateKey,
            extraPlugins: {
                operator: {
                    operatorContractAddress
                }
            }
        })
    })

    it.skip('accepts proxy connections', async () => {
        broker = await startBroker({
            privateKey: brokerWallet.privateKey,
            extraPlugins: {
                operator: {
                    operatorContractAddress
                }
            }
        })
        const subscriber = createClient(await fetchPrivateKeyWithGas())
        const stream = await createTestStream(subscriber, module)
        const brokerDescriptor = await broker.getPeerDescriptor()
        subscriber.setProxies({ id: stream.id }, [brokerDescriptor], ProxyDirection.SUBSCRIBE)
        await subscriber.subscribe(stream.id, () => {
        })
    })
})
