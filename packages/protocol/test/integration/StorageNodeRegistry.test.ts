import {createStorageNodeRegistry, getStorageNodeRegistryFromContract} from '../../src/utils/StorageNodeRegistry'

const contractAddress = '0xCBAcfA0592B3D809aEc805d527f8ceAe9307D9C0'
const jsonRpcProvider = `http://${process.env.STREAMR_DOCKER_DEV_HOST || 'localhost'}:8546`

describe('StorageNodeRegistry', () => {

    test('throw exception if address is wrong (ENS)', async () => {
        await expect(async () => (
            await getStorageNodeRegistryFromContract({
                contractAddress: 'address', jsonRpcProvider
            })
        )).rejects.toThrow('ENS')
    })

    test('throw exception if address is wrong', async () => {
        await expect(async () => (
            await getStorageNodeRegistryFromContract({
                contractAddress: '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', jsonRpcProvider
            })
        )).rejects.toThrow('call revert exception')
    })

    test('throw exception if jsonRpcProvider is wrong', async () => {
        await expect(async () => (
            await getStorageNodeRegistryFromContract({
                contractAddress, jsonRpcProvider: 'jsonRpcProvider'
            })
        )).rejects.toThrow('could not detect network')
    })

    describe('getAllStorageNodes', () => {
        test('get array of storage nodes', async () => {
            const storageNodeRegistry = await getStorageNodeRegistryFromContract({
                contractAddress, jsonRpcProvider
            })

            expect(storageNodeRegistry.getAllStorageNodes()).toStrictEqual([
                {
                    address: "0xde1112f631486CfC759A50196853011528bC5FA0",
                    url: "http://10.200.10.1:8891/api/v1",
                }
            ])
        })
    })

    describe('getStorageNodeHTTP', () => {
        test('get storage node HTTP with address', async () => {
            const storageNodeRegistry = await getStorageNodeRegistryFromContract({
                contractAddress, jsonRpcProvider
            })

            expect(
                storageNodeRegistry.getStorageNodeHTTP("0xde1112f631486CfC759A50196853011528bC5FA0")
            ).toEqual("http://10.200.10.1:8891/api/v1")
        })

        test('throw error if address not found', async () => {
            const storageNodeRegistry = await getStorageNodeRegistryFromContract({
                contractAddress, jsonRpcProvider
            })

            expect(() => {
                storageNodeRegistry.getStorageNodeHTTP("0xincorrectAddress")
            }).toThrow()
        })
    })

    describe('createStorageNodeRegistry', () => {
        test('creates storage node registry', () => {
            const storageNodeRegistry = createStorageNodeRegistry([
                {
                    address: "0xde1112f631486CfC759A50196853011528bC5FA0",
                    url: "http://10.200.10.1:8891/api/v1",
                }
            ])

            expect(storageNodeRegistry.getAllStorageNodes()).toStrictEqual([
                {
                    address: "0xde1112f631486CfC759A50196853011528bC5FA0",
                    url: "http://10.200.10.1:8891/api/v1",
                }
            ])
        })
    })
})
