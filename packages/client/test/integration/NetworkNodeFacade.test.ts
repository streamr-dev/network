import 'reflect-metadata'

import { fastPrivateKey, fastWallet } from '@streamr/test-utils'
import { CONFIG_TEST } from '../../src/ConfigTest'
import { StreamrClient } from '../../src/StreamrClient'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'

describe('NetworkNodeFacade', () => {

    let environment: FakeEnvironment

    beforeEach(() => {
        environment = new FakeEnvironment()
    })

    afterEach(async () => {
        await environment.destroy()
    })

    describe('id assignment/generation', () => {
        it('generates node id from address, if id not supplied', async () => {
            const client = environment.createClient({
                auth: {
                    privateKey: fastPrivateKey()
                }
            })
            const nodeId = await client.getNodeId()
            const expectedPrefix = `${await client.getAddress()}#`
            expect(nodeId.startsWith(expectedPrefix)).toBe(true)
            expect(nodeId.length).toBeGreaterThan(expectedPrefix.length) // has more characters after #
        })

        it('generates different ids for different clients with same private key', async () => {
            const privateKey = fastPrivateKey()
            const client1 = environment.createClient({
                auth: {
                    privateKey
                }
            })
            const client2 = environment.createClient({
                auth: {
                    privateKey
                }
            })
            // same key, same address
            expect(await client1.getAddress()).toEqual(await client2.getAddress())
            const expectedPrefix = `${await client1.getAddress()}#`
            const node1Id = await client1.getNodeId()
            const node2Id = await client2.getNodeId()
            // both start with same prefix
            expect(node1Id.startsWith(expectedPrefix)).toBe(true)
            expect(node2Id.startsWith(expectedPrefix)).toBe(true)
            expect(node1Id).not.toEqual(node2Id)
        })

        it('uses supplied network node id, if compatible', async () => {
            const wallet = fastWallet()
            const nodeId = `${wallet.address}#my-custom-id`
            const client = environment.createClient({
                auth: {
                    privateKey: wallet.privateKey
                },
                network: {
                    ...CONFIG_TEST.network,
                    node: {
                        id: nodeId
                    }
                }
            })
            expect(await client.getNodeId()).toEqual(nodeId)
        })

        it('throws error if supplied network node id not compatible', async () => {
            const nodeId = '0xafafafafafafafafafafafafafafafafafafafaf#my-custom-id'
            const client = environment.createClient({
                auth: {
                    privateKey: fastPrivateKey()
                },
                network: {
                    node: {
                        id: nodeId
                    }
                }
            })
            await expect(async () => {
                await client.getNode()
            }).rejects.toThrow(/not compatible with authenticated wallet/)
        })
    })

    describe('create/destroy', () => {
        let client: StreamrClient

        beforeEach(async () => {
            client = environment.createClient({
                auth: {
                    privateKey: fastPrivateKey()
                }
            })
        })

        it('caches node', async () => {
            const node1 = await client.getNode()
            const node2 = await client.getNode()
            expect(node1).toBe(node2)
        })

        it('caches node with parallel calls', async () => {
            const [node1, node2] = await Promise.all([
                client.getNode(),
                client.getNode(),
            ])
            expect(node1).toBe(node2)
        })

        describe('getting node after destroy is an error', () => {
            it('can destroy after start', async () => {
                await client.getNode()
                await client.destroy()
                await expect(async () => {
                    await client.getNode()
                }).rejects.toThrowStreamrError({ code: 'CLIENT_DESTROYED' })
            })

            it('can call destroy multiple times', async () => {
                await client.getNode()
                await Promise.all([
                    client.destroy(),
                    client.destroy(),
                ])
                await client.destroy()
                await expect(async () => {
                    await client.getNode()
                }).rejects.toThrowStreamrError({ code: 'CLIENT_DESTROYED' })
            })

            it('can destroy before start', async () => {
                await client.destroy()
                await expect(async () => {
                    await client.getNode()
                }).rejects.toThrowStreamrError({ code: 'CLIENT_DESTROYED' })
            })

            it('can destroy during start', async () => {
                await expect(async () => {
                    const tasks = [
                        client.getNode(),
                        client.destroy(),
                    ]
                    await Promise.allSettled(tasks)
                    await Promise.all(tasks)
                }).rejects.toThrowStreamrError({ code: 'CLIENT_DESTROYED' })
            })
        })
    })
})
