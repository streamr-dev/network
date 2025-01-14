import type { Operator } from '@streamr/network-contracts'
import { ProxyDirection, StreamPermission, _operatorContractUtils } from '@streamr/sdk'
import { fastPrivateKey, fetchPrivateKeyWithGas, generateWalletWithGasAndTokens } from '@streamr/test-utils'
import { EthereumAddress, collect, toEthereumAddress, toStreamPartID, until } from '@streamr/utils'
import { Wallet, parseEther } from 'ethers'
import { cloneDeep, set } from 'lodash'
import { Broker, createBroker } from '../../../../src/broker'
import { formCoordinationStreamId } from '../../../../src/plugins/operator/formCoordinationStreamId'
import { createClient, createTestStream, formConfig, startBroker } from '../../../utils'

const { delegate, deploySponsorshipContract, setupOperatorContract, sponsor, stake } = _operatorContractUtils

const DEFAULT_STREAM_PARTITION = 0

describe('OperatorPlugin', () => {
    let broker: Broker
    let brokerWallet: Wallet
    let operatorContract: Operator
    let operatorWallet: Wallet

    beforeAll(async () => {
        const deployment = await setupOperatorContract({
            nodeCount: 1,
            generateWalletWithGasAndTokens
        })
        brokerWallet = deployment.nodeWallets[0]
        operatorWallet = deployment.operatorWallet
        operatorContract = deployment.operatorContract
    }, 30 * 1000)

    afterEach(async () => {
        await broker.stop()
    })

    async function waitForHeartbeatMessage(operatorContractAddress: EthereumAddress): Promise<void> {
        const client = createClient(fastPrivateKey())
        const sub = await client.subscribe(formCoordinationStreamId(operatorContractAddress))
        await collect(sub, 1)
        await client.destroy()
    }

    it(
        'accepts proxy connections',
        async () => {
            const subscriber = createClient(await fetchPrivateKeyWithGas())
            const stream = await createTestStream(subscriber, module)

            const sponsorer = await generateWalletWithGasAndTokens()
            const sponsorship1 = await deploySponsorshipContract({ streamId: stream.id, deployer: sponsorer })
            await sponsor(sponsorer, await sponsorship1.getAddress(), parseEther('10000'))
            await delegate(operatorWallet, await operatorContract.getAddress(), parseEther('10000'))
            await stake(operatorContract, await sponsorship1.getAddress(), parseEther('10000'))

            const publisher = createClient(fastPrivateKey())
            await stream.grantPermissions({
                permissions: [StreamPermission.PUBLISH],
                userId: await publisher.getUserId()
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
            await until(async () => (await broker.getStreamrClient().getSubscriptions(stream.id)).length > 0)
            const brokerDescriptor = await broker.getStreamrClient().getPeerDescriptor()
            await subscriber.setProxies({ id: stream.id }, [brokerDescriptor], ProxyDirection.SUBSCRIBE)
            const subscription = await subscriber.subscribe(stream.id)
            const receivedMessages = await collect(subscription, 1)
            clearInterval(publishTimer)

            expect(receivedMessages[0].content).toEqual({ foo: 'bar' })
            await subscriber.destroy()
            await publisher.destroy()
        },
        60 * 1000
    ) // TODO why this is slower?

    it('invalid configuration', async () => {
        await expect(async () => {
            let config = formConfig({
                privateKey: brokerWallet.privateKey,
                extraPlugins: {
                    operator: {
                        operatorContractAddress: await operatorContract.getAddress()
                    }
                }
            })
            // clone the config as we inject some TEST_CONFIG properties by refence in formConfig
            // -> without cloning we'd modify also the TEST_CONFIG object
            config = cloneDeep(config)
            set(config, 'client.network.node.acceptProxyConnections', false)
            await createBroker(config)
        }).rejects.toThrow(
            'Plugin operator doesn\'t support client config value "false" in network.node.acceptProxyConnections'
        )
    })

    it('operator discovery', async () => {
        const client = createClient(await fetchPrivateKeyWithGas())
        const stream = await createTestStream(client, module)

        const sponsorer = await generateWalletWithGasAndTokens()
        const sponsorship = await deploySponsorshipContract({ streamId: stream.id, deployer: sponsorer })
        await sponsor(sponsorer, await sponsorship.getAddress(), parseEther('10000'))
        await delegate(operatorWallet, await operatorContract.getAddress(), parseEther('10000'))
        await stake(operatorContract, await sponsorship.getAddress(), parseEther('10000'))

        const operatorContractAddress = await operatorContract.getAddress()
        broker = await startBroker({
            privateKey: brokerWallet.privateKey,
            extraPlugins: {
                operator: {
                    operatorContractAddress,
                    heartbeatUpdateIntervalInMs: 100,
                    fleetState: {
                        warmupPeriodInMs: 0
                    }
                }
            }
        })
        await until(async () => (await broker.getStreamrClient().getSubscriptions(stream.id)).length > 0)
        await waitForHeartbeatMessage(toEthereumAddress(operatorContractAddress))
        const brokerDescriptor = await broker.getStreamrClient().getPeerDescriptor()
        const operators = await client
            .getNode()
            .discoverOperators(brokerDescriptor, toStreamPartID(stream.id, DEFAULT_STREAM_PARTITION))
        expect(operators[0].nodeId).toEqual(brokerDescriptor.nodeId)
    })
})
