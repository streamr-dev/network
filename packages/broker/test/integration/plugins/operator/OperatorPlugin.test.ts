import { parseEther } from '@ethersproject/units'
import { config as CHAIN_CONFIG } from '@streamr/config'
import type { Operator } from '@streamr/network-contracts'
import { fastPrivateKey, fastWallet, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { toEthereumAddress, wait } from '@streamr/utils'
import { Wallet } from 'ethers'
import { ProxyDirection, StreamPermission } from 'streamr-client'
import { Broker } from '../../../../src/broker'
import { createClient, createTestStream, startBroker } from '../../../utils'
import { setupOperatorContract } from './setupOperatorContract'
import { deploySponsorship, generateWalletWithGasAndTokens, getProvider, getTokenContract } from './smartContractUtils'
import { DEFAULT_MINIMUM_STAKE } from './deploySponsorshipContract'

const chainConfig = CHAIN_CONFIG["dev1"]
const theGraphUrl = `http://${process.env.STREAMR_DOCKER_DEV_HOST ?? '127.0.0.1'}:8000/subgraphs/name/streamr-dev/network-subgraphs`

const DEFAULT_SENDER = '0x'
const SPONSORSHIP_AMOUNT = parseEther('500')

describe('OperatorPlugin', () => {
    let broker: Broker
    let brokerWallet: Wallet
    let operatorContract: Operator
    let operatorWallet: Wallet

    beforeAll(async () => {
        brokerWallet = fastWallet()
        const deployment = (await setupOperatorContract({
            nodeAddresses: [toEthereumAddress(brokerWallet.address)],
            provider: getProvider(), 
            chainConfig, 
            theGraphUrl
        }))
        operatorWallet = deployment.operatorWallet
        operatorContract = deployment.operatorContract
    }, 30 * 1000)

    afterEach(async () => {
        await Promise.allSettled([broker?.stop()])
    })

    it('accepts proxy connections', async () => {
        const subscriber = createClient(await fetchPrivateKeyWithGas())
        const stream = await createTestStream(subscriber, module)

        const sponsorship = await deploySponsorship(stream.id, await generateWalletWithGasAndTokens(getProvider(), chainConfig))
        await (await getTokenContract().connect(operatorWallet).approve(sponsorship.address, SPONSORSHIP_AMOUNT)).wait()
        await (await sponsorship.connect(operatorWallet).sponsor(SPONSORSHIP_AMOUNT)).wait()

        // eslint-disable-next-line max-len
        await (await getTokenContract().connect(operatorWallet).transferAndCall(operatorContract.address, DEFAULT_MINIMUM_STAKE, DEFAULT_SENDER)).wait()
        await wait(3000)  // TODO remove wait after we've migrated to the fast chain
        await (await operatorContract.stake(sponsorship.address, DEFAULT_MINIMUM_STAKE)).wait()

        const publisher = createClient(fastPrivateKey())
        await stream.grantPermissions({
            permissions: [StreamPermission.PUBLISH],
            user: await publisher.getAddress()
        })
        const publishTimer = setInterval(async () => {
            await publisher.publish({ id: stream.id }, { foo: 'bar' })
        }, 500)
        broker = await startBroker({
            privateKey: brokerWallet.privateKey,
            extraPlugins: {
                operator: {
                    operatorContractAddress: operatorContract.address
                }
            }
        })
        const brokerDescriptor = await broker.getPeerDescriptor()
        await subscriber.setProxies({ id: stream.id }, [brokerDescriptor], ProxyDirection.SUBSCRIBE)
        await subscriber.subscribe(stream.id, (_content) => {
            // eslint-disable-next-line no-console
            // console.log(_content)
        })
        await wait(30000)
        clearInterval(publishTimer)
        await subscriber.destroy()
        await publisher.destroy()
    }, 90 * 1000)
})
