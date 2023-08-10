import { Chains } from '@streamr/config'
import { fastPrivateKey, fastWallet, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { Wallet } from 'ethers'
import { ProxyDirection, StreamPermission } from 'streamr-client'
import { Broker } from '../../../../src/broker'
import { createClient, createTestStream, startBroker } from '../../../utils'
import { setupOperatorContract } from './setupOperatorContract'
import { deploySponsorship, generateWalletWithGasAndTokens, getProvider } from './smartContractUtils'
import { toEthereumAddress, wait } from '@streamr/utils'

const chainConfig = Chains.load()["dev1"]
const theGraphUrl = `http://${process.env.STREAMR_DOCKER_DEV_HOST ?? '127.0.0.1'}:8000/subgraphs/name/streamr-dev/network-subgraphs`

describe('OperatorPlugin', () => {
    let broker: Broker
    let brokerWallet: Wallet
    let operatorContractAddress: string

    beforeAll(async () => {
        brokerWallet = fastWallet()
        const deployment = (await setupOperatorContract({
            nodeAddresses: [toEthereumAddress(brokerWallet.address)],
            provider: getProvider(), 
            chainConfig, 
            theGraphUrl
        }))
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

    it('accepts proxy connections', async () => {
        const subscriber = createClient(await fetchPrivateKeyWithGas())
        const stream = await createTestStream(subscriber, module)
        await deploySponsorship(stream.id, await generateWalletWithGasAndTokens(getProvider(), chainConfig))
        const publisher = createClient(fastPrivateKey())
        await stream.grantPermissions({
            permissions: [StreamPermission.PUBLISH],
            user: await publisher.getAddress()
        })
        setInterval(async () => {
            await publisher.publish({ id: stream.id }, { foo: 'bar' })
        }, 500)
        broker = await startBroker({
            privateKey: brokerWallet.privateKey,
            extraPlugins: {
                operator: {
                    operatorContractAddress
                }
            }
        })
        const brokerDescriptor = await broker.getPeerDescriptor()
        await subscriber.setProxies({ id: stream.id }, [brokerDescriptor], ProxyDirection.SUBSCRIBE)
        await subscriber.subscribe(stream.id, (_content) => {
            // eslint-disable-next-line no-console
            // console.log(_content)
        })
        await wait(10000)
    }, 60 * 1000)
})
