import type { Operator } from '@streamr/network-contracts-ethers6'
import {
    ProxyDirection,
    StreamPermission,
    _operatorContractUtils
} from '@streamr/sdk'
import { fastPrivateKey, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { collect, waitForCondition, StreamPartIDUtils, wait } from '@streamr/utils'
import { Wallet } from 'ethers'
import { Broker, createBroker } from '../../../../src/broker'
import { createClient, createTestStream, formConfig, startBroker } from '../../../utils'

const {
    delegate,
    deploySponsorshipContract,
    generateWalletWithGasAndTokens,
    setupOperatorContract,
    sponsor,
    stake
} = _operatorContractUtils

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
        await sponsor(sponsorer, await sponsorship1.getAddress(), 10000)
        await delegate(operatorWallet, await operatorContract.getAddress(), 10000)
        await stake(operatorContract, await sponsorship1.getAddress(), 10000)

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
                    operatorContractAddress: await operatorContract.getAddress()
                }
            }
        })
        // wait for MaintainTopologyService to handle addStakedStreams
        // events emitted during Broker start
        await waitForCondition(async () => (await broker.getStreamrClient().getSubscriptions(stream.id)).length > 0)
        const brokerDescriptor = await broker.getStreamrClient().getPeerDescriptor()
        await subscriber.setProxies({ id: stream.id }, [brokerDescriptor], ProxyDirection.SUBSCRIBE)
        const subscription = await subscriber.subscribe(stream.id)
        const receivedMessages = await collect(subscription, 1)
        clearInterval(publishTimer)

        expect(receivedMessages[0].content).toEqual({ foo: 'bar' })
        await subscriber.destroy()
        await publisher.destroy()
    }, 60 * 1000)  // TODO why this is slower?

    it('invalid configuration', async () => {
        await expect(async () => {
            const config = formConfig({
                privateKey: brokerWallet.privateKey,
                extraPlugins: {
                    operator: {
                        operatorContractAddress: await operatorContract.getAddress()
                    }
                }
            })
            config.client!.network!.node!.acceptProxyConnections = false
            await createBroker(config)
        }).rejects.toThrow('Plugin operator doesn\'t support client config value "false" in network.node.acceptProxyConnections')
    })
    
    it('Accepts OperatorDiscoveryRequests', async () => {
        const client = createClient(await fetchPrivateKeyWithGas())
        const stream = await createTestStream(client, module)

        const sponsorer = await generateWalletWithGasAndTokens()
        const sponsorship1 = await deploySponsorshipContract({ streamId: stream.id, deployer: sponsorer })
        await sponsor(sponsorer, await sponsorship1.getAddress(), 10000)
        await delegate(operatorWallet, await operatorContract.getAddress(), 10000)
        await stake(operatorContract, await sponsorship1.getAddress(), 10000)

        broker = await startBroker({
            privateKey: brokerWallet.privateKey,
            extraPlugins: {
                operator: {
                    operatorContractAddress: await operatorContract.getAddress(),
                }
            }
        })
        await waitForCondition(async () => (await broker.getStreamrClient().getSubscriptions(stream.id)).length > 0)
        // Ensure that heartbeat has been sent (setting heartbeatUpdateIntervalInMs lower did not help)
        await wait(10000)
        const brokerDescriptor = await broker.getStreamrClient().getPeerDescriptor()
        const operators = await client.getNode().discoverOperators(brokerDescriptor, StreamPartIDUtils.parse(`${stream.id}#0`))
        expect(operators[0].nodeId).toEqual(brokerDescriptor.nodeId)
    }, 60 * 1000)

})
