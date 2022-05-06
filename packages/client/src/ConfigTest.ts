import { Chains } from "@streamr/config"

function toNumber(value: any): number | undefined {
    return (value !== undefined) ? Number(value) : undefined
}

const chainConfig = Chains.load('development')

const DEFAULT_RPC_TIMEOUT = 30 * 1000

const mainChainConfig = {
    name: 'dev_ethereum',
    chainId: chainConfig.ethereum.id,
    rpcs: chainConfig.ethereum.rpcEndpoints.map(({ url }) => ({
        url,
        timeout: toNumber(process.env.TEST_TIMEOUT) ?? DEFAULT_RPC_TIMEOUT
    }))
}

const sideChainConfig = {
    name: 'streamr',
    chainId: chainConfig.streamr.id,
    rpcs: chainConfig.streamr.rpcEndpoints.map(({ url }) => ({
        url,
        timeout: toNumber(process.env.TEST_TIMEOUT) ?? DEFAULT_RPC_TIMEOUT
    }))
}

/**
 * Streamr client constructor options that work in the test environment
 */
export const ConfigTest = {
    theGraphUrl: `http://${process.env.STREAMR_DOCKER_DEV_HOST || '10.200.10.1'}:8000/subgraphs/name/streamr-dev/network-contracts`,
    streamRegistryChainAddress: chainConfig.streamr.contracts.StreamRegistry,
    streamStorageRegistryChainAddress: chainConfig.streamr.contracts.StreamStorageRegistry,
    storageNodeRegistryChainAddress: chainConfig.streamr.contracts.StorageNodeRegistry,
    network: {
        trackers: [
            {
                id: '0xb9e7cEBF7b03AE26458E32a059488386b05798e8',
                ws: `ws://${process.env.STREAMR_DOCKER_DEV_HOST || '127.0.0.1'}:30301`,
                http: `http://${process.env.STREAMR_DOCKER_DEV_HOST || '127.0.0.1'}:30301`
            }, {
                id: '0x0540A3e144cdD81F402e7772C76a5808B71d2d30',
                ws: `ws://${process.env.STREAMR_DOCKER_DEV_HOST || '127.0.0.1'}:30302`,
                http: `http://${process.env.STREAMR_DOCKER_DEV_HOST || '127.0.0.1'}:30302`
            }, {
                id: '0xf2C195bE194a2C91e93Eacb1d6d55a00552a85E2',
                ws: `ws://${process.env.STREAMR_DOCKER_DEV_HOST || '127.0.0.1'}:30303`,
                http: `http://${process.env.STREAMR_DOCKER_DEV_HOST || '127.0.0.1'}:30303`
            }
        ],
        webrtcDisallowPrivateAddresses: false,
        stunUrls: []
    },
    mainChainRPCs: mainChainConfig,
    streamRegistryChainRPCs: sideChainConfig,
    maxRetries: 2,
    _timeouts: {
        theGraph: {
            timeout: 10 * 1000,
            retryInterval: 500
        },
        storageNode: {
            timeout: 30 * 1000,
            retryInterval: 500
        },
        jsonRpc: {
            timeout: 20 * 1000,
            retryInterval: 500
        },
        httpFetchTimeout: 30 * 1000
    }
}

export const DOCKER_DEV_STORAGE_NODE = '0xde1112f631486CfC759A50196853011528bC5FA0'
