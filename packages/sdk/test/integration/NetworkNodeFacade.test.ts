import 'reflect-metadata'

import { fastPrivateKey } from '@streamr/test-utils'
import { NetworkNodeStub } from '../../src/NetworkNodeFacade'
import { StreamrClient } from '../../src/StreamrClient'
import { peerDescriptorTranslator } from '../../src/utils/utils'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { fakeEntrypoint } from '../test-utils/fake/FakeOperatorRegistry'

describe('NetworkNodeFacade', () => {
    let environment: FakeEnvironment

    beforeEach(() => {
        environment = new FakeEnvironment()
    })

    afterEach(async () => {
        await environment.destroy()
    })

    describe('create/destroy', () => {
        let client: StreamrClient

        const getNode = (): Promise<Omit<NetworkNodeStub, 'start' | 'stop'>> => {
            return client.getNode().getNode()
        }

        beforeEach(async () => {
            client = environment.createClient({
                auth: {
                    privateKey: fastPrivateKey()
                }
            })
        })

        it('caches node', async () => {
            const node1 = await getNode()
            const node2 = await getNode()
            expect(node1).toBe(node2)
        })

        it('caches node with parallel calls', async () => {
            const [node1, node2] = await Promise.all([getNode(), getNode()])
            expect(node1).toBe(node2)
        })

        describe('getting node after destroy is an error', () => {
            it('can destroy after start', async () => {
                await getNode()
                await client.destroy()
                await expect(async () => {
                    await getNode()
                }).rejects.toThrowStreamrClientError({ code: 'CLIENT_DESTROYED' })
            })

            it('can call destroy multiple times', async () => {
                await getNode()
                await Promise.all([client.destroy(), client.destroy()])
                await client.destroy()
                await expect(async () => {
                    await getNode()
                }).rejects.toThrowStreamrClientError({ code: 'CLIENT_DESTROYED' })
            })

            it('can destroy before start', async () => {
                await client.destroy()
                await expect(async () => {
                    await getNode()
                }).rejects.toThrowStreamrClientError({ code: 'CLIENT_DESTROYED' })
            })

            it('can destroy during start', async () => {
                await expect(async () => {
                    const tasks = [getNode(), client.destroy()]
                    await Promise.allSettled(tasks)
                    await Promise.all(tasks)
                }).rejects.toThrowStreamrClientError({ code: 'CLIENT_DESTROYED' })
            })
        })
    })

    describe('endpoint discovery', () => {
        it('queries endpoints if discoverEndpoints is true', async () => {
            const client = environment.createClient({
                network: {
                    controlLayer: {
                        entryPointDiscovery: {
                            enabled: true
                        }
                    }
                }
            })
            const node = client.getNode()
            expect((await node.getOptions()).layer0?.entryPoints).toContainEqual(
                peerDescriptorTranslator(fakeEntrypoint)
            )
        })

        it('does not query endpoints if discoverEndpoints is false', async () => {
            const client = environment.createClient({
                network: {
                    controlLayer: {
                        entryPointDiscovery: {
                            enabled: false
                        }
                    }
                }
            })
            const node = client.getNode()
            expect((await node.getOptions()).layer0?.entryPoints).not.toContainEqual(
                peerDescriptorTranslator(fakeEntrypoint)
            )
        })
    })
})
