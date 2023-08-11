import { toEthereumAddress } from '@streamr/utils'
import { StreamrClientConfig, NetworkNodeType } from './Config'
import { MIN_KEY_LENGTH } from './encryption/RSAKeyPair'
import { Chains } from '@streamr/config'

const CHAIN_CONFIG = Chains.load()['dev2']

function toNumber(value: any): number | undefined {
    return (value !== undefined) ? Number(value) : undefined
}

const sideChainConfig = {
    name: 'streamr',
    chainId: 8997,
    rpcs: [{
        url: process.env.SIDECHAIN_URL || `http://${process.env.STREAMR_DOCKER_DEV_HOST || '127.0.0.1'}:8546`,
        timeout: toNumber(process.env.TEST_TIMEOUT) ?? 30 * 1000,
    }]
}

/**
 * Streamr client constructor options that work in the test environment
 */
export const CONFIG_TEST: StreamrClientConfig = {
    network: {
        controlLayer: {
            entryPoints: [{
                id: 'entryPointBroker',
                type: NetworkNodeType.NODEJS,
                websocket: {
                    ip: '127.0.0.1',
                    port: 40401
                }
            }],
            iceServers: [],
            webrtcAllowPrivateAddresses: true
        }
    },
    contracts: {
        streamRegistryChainAddress: CHAIN_CONFIG.contracts.StreamRegistry,
        streamStorageRegistryChainAddress: CHAIN_CONFIG.contracts.StreamStorageRegistry,
        storageNodeRegistryChainAddress: CHAIN_CONFIG.contracts.StorageNodeRegistry,
        mainChainRPCs: {
            name: 'dev_ethereum',
            chainId: 8995,
            rpcs: [{
                url: process.env.ETHEREUM_SERVER_URL || `http://${process.env.STREAMR_DOCKER_DEV_HOST || '127.0.0.1'}:8545`,
                timeout: toNumber(process.env.TEST_TIMEOUT) ?? 30 * 1000
            }]
        },
        streamRegistryChainRPCs: sideChainConfig,
        theGraphUrl: `http://${process.env.STREAMR_DOCKER_DEV_HOST || '127.0.0.1'}:8800/subgraphs/name/streamr-dev/network-contracts`,
    },
    encryption: {
        rsaKeyLength: MIN_KEY_LENGTH
    },
    _timeouts: {
        theGraph: {
            indexTimeout: 10 * 1000,
            indexPollInterval: 500
        },
        storageNode: {
            timeout: 30 * 1000,
            retryInterval: 500
        },
        ensStreamCreation: {
            timeout: 20 * 1000,
            retryInterval: 500
        }
    },
    metrics: false
}

export const DOCKER_DEV_STORAGE_NODE = toEthereumAddress('0xde1112f631486CfC759A50196853011528bC5FA0')
