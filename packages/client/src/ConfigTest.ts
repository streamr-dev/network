import { toEthereumAddress } from '@streamr/utils'
import { StreamrClientConfig, NetworkNodeType } from './Config'
import { MIN_KEY_LENGTH } from './encryption/RSAKeyPair'
import { config as CHAIN_CONFIG } from '@streamr/config'

const MAIN_CHAIN_CONFIG = CHAIN_CONFIG['dev0']
const SIDE_CHAIN_CONFIG = CHAIN_CONFIG['dev1']

function toNumber(value: any): number | undefined {
    return (value !== undefined) ? Number(value) : undefined
}

const sideChainConfig = {
    name: SIDE_CHAIN_CONFIG.name,
    chainId: SIDE_CHAIN_CONFIG.id,
    rpcs: [{
        url: SIDE_CHAIN_CONFIG.rpcEndpoints[0].url,
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
        streamRegistryChainAddress: SIDE_CHAIN_CONFIG.contracts.StreamRegistry,
        streamStorageRegistryChainAddress: SIDE_CHAIN_CONFIG.contracts.StreamStorageRegistry,
        storageNodeRegistryChainAddress: SIDE_CHAIN_CONFIG.contracts.StorageNodeRegistry,
        mainChainRPCs: {
            name: MAIN_CHAIN_CONFIG.name,
            chainId: MAIN_CHAIN_CONFIG.id,
            rpcs: [{
                url: MAIN_CHAIN_CONFIG.rpcEndpoints[0].url,
                timeout: toNumber(process.env.TEST_TIMEOUT) ?? 30 * 1000
            }]
        },
        streamRegistryChainRPCs: sideChainConfig,
        theGraphUrl: `http://${process.env.STREAMR_DOCKER_DEV_HOST || '127.0.0.1'}:8800/subgraphs/name/streamr-dev/network-subgraphs`,
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
