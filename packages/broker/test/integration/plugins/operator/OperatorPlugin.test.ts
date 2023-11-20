import type { Operator } from '@streamr/network-contracts'
import { fastPrivateKey, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { collect } from '@streamr/utils'
import { Wallet } from 'ethers'
import { ProxyDirection, StreamPermission } from 'streamr-client'
import { Broker, createBroker } from '../../../../src/broker'
import { createClient, createTestStream, formConfig, startBroker } from '../../../utils'
import { delegate, deploySponsorshipContract, generateWalletWithGasAndTokens, setupOperatorContract, sponsor, stake } from './contractUtils'
import { wait } from '@streamr/utils'

describe('OperatorPlugin', () => {

    let broker: Broker
    let brokerWallet: Wallet
    let operatorContract: Operator
    let operatorWallet: Wallet

    beforeAll(async () => {
        const deployment = (await setupOperatorContract({
            nodeCount: 1
        }))
        brokerWallet = deployment.nodeWallets[0]
        operatorWallet = deployment.operatorWallet
        operatorContract = deployment.operatorContract
    }, 30 * 1000)

    afterEach(async () => {
        await broker?.stop()
    })

    it('accepts proxy connections', async () => {
        const subscriber = createClient(await fetchPrivateKeyWithGas())
        const stream = await createTestStream(subscriber, module)

        const sponsorer = await generateWalletWithGasAndTokens()
        const sponsorship1 = await deploySponsorshipContract({ streamId: stream.id, deployer: sponsorer })
        await sponsor(sponsorer, sponsorship1.address, 10000)
        await delegate(operatorWallet, operatorContract.address, 10000)
        await stake(operatorContract, sponsorship1.address, 10000)

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
        // wait for a while so that MaintainTopologyService has time to handle addStakedStreams
        // events emitted during Broker start
        await wait(500)
        const brokerDescriptor = await broker.getStreamrClient().getPeerDescriptor()
        await subscriber.setProxies({ id: stream.id }, [brokerDescriptor], ProxyDirection.SUBSCRIBE)
        const subscription = await subscriber.subscribe(stream.id)
        const receivedMessages = await collect(subscription, 1)
        clearInterval(publishTimer)

        expect(receivedMessages[0].content).toEqual({ foo: 'bar' })
        await subscriber.destroy()
        await publisher.destroy()
    }, 60 * 1000)

    it('invalid configuration', async () => {
        await expect(async () => {
            const config = formConfig({
                privateKey: brokerWallet.privateKey,
                extraPlugins: {
                    operator: {
                        operatorContractAddress: operatorContract.address
                    }
                }
            })
            config.client!.network!.node!.acceptProxyConnections = false
            await createBroker(config)
        }).rejects.toThrow('Plugin operator doesn\'t support client config value "false" in network.node.acceptProxyConnections')
    })
})
