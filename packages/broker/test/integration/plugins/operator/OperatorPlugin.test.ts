import type { Operator } from '@streamr/network-contracts'
import { fastPrivateKey, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { waitForCondition } from '@streamr/utils'
import { Wallet } from 'ethers'
import { ProxyDirection, StreamPermission } from 'streamr-client'
import { Broker } from '../../../../src/broker'
import { createClient, createTestStream, startBroker } from '../../../utils'
import { delegate, deploySponsorshipContract, generateWalletWithGasAndTokens, setupOperatorContract, sponsor, stake } from './contractUtils'

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
        await delegate(operatorWallet, operatorContract.address, 100)
        const sponsorship1 = await deploySponsorshipContract({ streamId: stream.id, deployer: sponsorer })
        await sponsor(sponsorer, sponsorship1.address, 100)
        await stake(operatorContract, sponsorship1.address, 100)

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
        const brokerDescriptor = await broker.getStreamrClient().getPeerDescriptor()
        await subscriber.setProxies({ id: stream.id }, [brokerDescriptor], ProxyDirection.SUBSCRIBE)
        const receivedMessages: any[] = []
        await subscriber.subscribe(stream.id, (content: any) => {
            receivedMessages.push(content)
        })
        await waitForCondition(() => receivedMessages.length > 0)
        clearInterval(publishTimer)

        expect(receivedMessages![0]).toEqual({ foo: 'bar' })
        await subscriber.destroy()
        await publisher.destroy()
    }, 30 * 1000)
})
