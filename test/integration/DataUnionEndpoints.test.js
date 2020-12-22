/* eslint-disable no-await-in-loop */
import { Contract, providers, utils, Wallet } from 'ethers'
import debug from 'debug'
import { wait } from 'streamr-test-utils'

import StreamrClient from '../../src'
import * as Token from '../../contracts/TestToken.json'
import { getEndpointUrl } from '../../src/utils'
import authFetch from '../../src/rest/authFetch'

import config from './config'

const log = debug('StreamrClient::DataUnionEndpoints::integration-test')

describe('DataUnionEndPoints', () => {
    let dataUnion

    let testProvider
    let adminClient
    let adminWallet

    const createProduct = async () => {
        const DATA_UNION_VERSION = 1
        const properties = {
            beneficiaryAddress: dataUnion.address,
            type: 'DATAUNION',
            dataUnionVersion: DATA_UNION_VERSION
        }
        const url = getEndpointUrl(config.clientOptions.restUrl, 'products')
        return authFetch(
            url,
            adminClient.session,
            {
                method: 'POST',
                body: JSON.stringify(properties)
            }
        )
    }

    beforeAll(async () => {
        testProvider = new providers.JsonRpcProvider(config.ethereumServerUrl)
        log(`Connecting to Ethereum network, config = ${JSON.stringify(config)}`)

        const network = await testProvider.getNetwork()
        log('Connected to Ethereum network: ', JSON.stringify(network))

        adminWallet = new Wallet(config.privateKey, testProvider)
        adminClient = new StreamrClient({
            auth: {
                privateKey: adminWallet.privateKey
            },
            autoConnect: false,
            autoDisconnect: false,
            ...config.clientOptions,
        })

        log('beforeAll done')
    }, 10000)

    beforeEach(async () => {
        await adminClient.ensureConnected()
        dataUnion = await adminClient.deployDataUnion({
            provider: testProvider,
        })
        await dataUnion.deployed()
        log(`Deployment done for ${dataUnion.address}`)
        await dataUnion.isReady(2000, 200000)
        log(`DataUnion ${dataUnion.address} is ready to roll`)
        dataUnion.secret = await adminClient.createSecret(dataUnion.address, 'DataUnionEndpoints test secret')
        await createProduct()
    }, 300000)

    afterAll(async () => {
        if (!adminClient) { return }
        await adminClient.ensureDisconnected()
    })

    afterAll(async () => {
        await testProvider.removeAllListeners()
    })

    describe('Admin', () => {
        const memberAddressList = [
            '0x0000000000000000000000000000000000000001',
            '0x0000000000000000000000000000000000000002',
            '0x000000000000000000000000000000000000bEEF',
        ]

        it('can add and remove members', async () => {
            log('starting test')
            await adminClient.dataUnionIsReady(dataUnion.address, log)

            await adminClient.addMembers(dataUnion.address, memberAddressList, testProvider)
            await adminClient.hasJoined(dataUnion.address, memberAddressList[0])
            const res = await adminClient.getDataUnionStats(dataUnion.address)
            expect(res.memberCount).toEqual({
                total: 3, active: 3, inactive: 0
            })

            await adminClient.kick(dataUnion.address, memberAddressList.slice(1), testProvider)
            await wait(1000) // TODO: instead of sleeping, find a way to check server has registered the parting
            const res2 = await adminClient.getDataUnionStats(dataUnion.address)
            expect(res2.memberCount).toEqual({
                total: 3, active: 1, inactive: 2
            })
        }, 300000)

        // separate test for adding and removing secrets? Adding secret is tested in member joins dataUnion test though.
    })

    describe('Members', () => {
        let memberClient
        const memberWallet = new Wallet('0x1000000000000000000000000000000000000000000000000000000000000001', testProvider)

        beforeAll(async () => {
            memberClient = new StreamrClient({
                auth: {
                    privateKey: memberWallet.privateKey
                },
                autoConnect: false,
                autoDisconnect: false,
                ...config.clientOptions,
            })
            await memberClient.ensureConnected()
        })

        afterAll(async () => {
            if (!memberClient) { return }
            await memberClient.ensureDisconnected()
        })

        it('can join the dataUnion, and get their balances and stats, and check proof, and withdraw', async () => {
            // send eth so the member can afford to send tx
            await adminWallet.sendTransaction({
                to: memberWallet.address,
                value: utils.parseEther('1'),
            })

            const res = await memberClient.joinDataUnion(dataUnion.address, dataUnion.secret)
            await memberClient.hasJoined(dataUnion.address)
            expect(res).toMatchObject({
                state: 'ACCEPTED',
                memberAddress: memberWallet.address,
                contractAddress: dataUnion.address,
            })

            // too much bother to check this in a separate test... TODO: split
            const res2 = await memberClient.getMemberStats(dataUnion.address)
            expect(res2).toEqual({
                active: true,
                address: memberWallet.address,
                earnings: '0',
                recordedEarnings: '0',
                withdrawableEarnings: '0',
                frozenEarnings: '0'
            })

            // add revenue, just to see some action
            const opWallet = new Wallet('0x5e98cce00cff5dea6b454889f359a4ec06b9fa6b88e9d69b86de8e1c81887da0', testProvider)
            const opToken = new Contract(adminClient.options.tokenAddress, Token.abi, opWallet)
            const tx = await opToken.mint(dataUnion.address, utils.parseEther('1'))
            const tr = await tx.wait(2)
            expect(tr.events[0].event).toBe('Transfer')
            expect(tr.events[0].args.from).toBe('0x0000000000000000000000000000000000000000')
            expect(tr.events[0].args.to).toBe(dataUnion.address)
            expect(tr.events[0].args.value.toString()).toBe('1000000000000000000')
            await wait(1000)

            // note: getMemberStats without explicit address => get stats of the authenticated StreamrClient
            let res3 = await memberClient.getMemberStats(dataUnion.address)
            while (!res3.withdrawableBlockNumber) {
                await wait(4000)
                res3 = await memberClient.getMemberStats(dataUnion.address)
            }
            expect(res3).toMatchObject({
                active: true,
                address: memberWallet.address,
                earnings: '1000000000000000000',
                recordedEarnings: '1000000000000000000',
                withdrawableEarnings: '1000000000000000000',
                frozenEarnings: '0',
                withdrawableBlockNumber: res3.withdrawableBlockNumber,
            })

            const isValid = await memberClient.validateProof(dataUnion.address, {
                provider: testProvider
            })
            expect(isValid).toBeTruthy()

            const walletBefore = await opToken.balanceOf(memberWallet.address)
            await wait(80000)
            const tr2 = await memberClient.withdraw(dataUnion.address, {
                provider: testProvider
            })
            expect(tr2.logs[0].address).toBe(adminClient.options.tokenAddress)

            const walletAfter = await opToken.balanceOf(memberWallet.address)
            const diff = walletAfter.sub(walletBefore)
            expect(diff.toString()).toBe(res3.withdrawableEarnings)
        }, 600000)

        // TODO: test withdrawTo, withdrawFor, getBalance
    })

    describe('Anyone', () => {
        const memberAddressList = [
            '0x0000000000000000000000000000000000000001',
            '0x0000000000000000000000000000000000000002',
            '0x000000000000000000000000000000000000bEEF',
        ]

        let client
        beforeAll(async () => {
            client = new StreamrClient({
                auth: {
                    apiKey: 'tester1-api-key'
                },
                autoConnect: false,
                autoDisconnect: false,
                ...config.clientOptions,
            })
        })
        afterAll(async () => {
            if (!client) { return }
            await client.ensureDisconnected()
        })

        it('can get dataUnion stats, member list, and member stats', async () => {
            await adminClient.addMembers(dataUnion.address, memberAddressList, testProvider)
            await adminClient.hasJoined(dataUnion.address, memberAddressList[0])

            // mint tokens to dataUnion to generate revenue
            const opWallet = new Wallet('0x5e98cce00cff5dea6b454889f359a4ec06b9fa6b88e9d69b86de8e1c81887da0', testProvider)
            const opToken = new Contract(adminClient.options.tokenAddress, Token.abi, opWallet)
            const tx = await opToken.mint(dataUnion.address, utils.parseEther('1'))
            const tr = await tx.wait(2)
            expect(tr.events[0].event).toBe('Transfer')
            expect(tr.events[0].args.from).toBe('0x0000000000000000000000000000000000000000')
            expect(tr.events[0].args.to).toBe(dataUnion.address)

            await wait(1000)
            let mstats = await client.getMemberStats(dataUnion.address, memberAddressList[0])
            while (!mstats.withdrawableBlockNumber) {
                await wait(4000)
                mstats = await client.getMemberStats(dataUnion.address, memberAddressList[0])
            }

            // TODO: clean up asserts
            const cstats = await client.getDataUnionStats(dataUnion.address)
            const mlist = await client.getMembers(dataUnion.address)

            expect(cstats.memberCount).toEqual({
                total: 3, active: 3, inactive: 0
            })
            expect(cstats.totalEarnings).toBe('1000000000000000000')
            expect(cstats.latestWithdrawableBlock.memberCount).toBe(4)
            expect(cstats.latestWithdrawableBlock.totalEarnings).toBe('1000000000000000000')
            expect(mlist).toEqual([{
                active: true,
                address: '0x0000000000000000000000000000000000000001',
                earnings: '333333333333333333'
            },
            {
                active: true,
                address: '0x0000000000000000000000000000000000000002',
                earnings: '333333333333333333'
            },
            {
                active: true,
                address: '0x000000000000000000000000000000000000bEEF',
                earnings: '333333333333333333'
            }])
            expect(mstats).toMatchObject({
                active: true,
                address: '0x0000000000000000000000000000000000000001',
                earnings: '333333333333333333',
                recordedEarnings: '333333333333333333',
                withdrawableEarnings: '333333333333333333',
                frozenEarnings: '0',
                withdrawableBlockNumber: cstats.latestWithdrawableBlock.blockNumber,
            })
        }, 300000)
    })
})
