import { toEthereumAddress } from '@streamr/utils'
import { StreamrClientConfig, NetworkNodeType } from './Config'
import { MIN_KEY_LENGTH } from './encryption/RSAKeyPair'
import { config as CHAIN_CONFIG } from '@streamr/config'

const DOCKER_DEV_CHAIN_CONFIG = CHAIN_CONFIG.dev2

function toNumber(value: any): number | undefined {
    return (value !== undefined) ? Number(value) : undefined
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
            webSocketPort: undefined,
            iceServers: [],
            webrtcAllowPrivateAddresses: true
        }
    },
    contracts: {
        streamRegistryChainAddress: DOCKER_DEV_CHAIN_CONFIG.contracts.StreamRegistry,
        streamStorageRegistryChainAddress: DOCKER_DEV_CHAIN_CONFIG.contracts.StreamStorageRegistry,
        storageNodeRegistryChainAddress: DOCKER_DEV_CHAIN_CONFIG.contracts.StorageNodeRegistry,
        mainChainRPCs: {
            name: DOCKER_DEV_CHAIN_CONFIG.name,
            chainId: DOCKER_DEV_CHAIN_CONFIG.id,
            rpcs: [{
                url: DOCKER_DEV_CHAIN_CONFIG.rpcEndpoints[0].url,
                timeout: toNumber(process.env.TEST_TIMEOUT) ?? 30 * 1000
            }]
        },
        streamRegistryChainRPCs: {
            name: DOCKER_DEV_CHAIN_CONFIG.name,
            chainId: DOCKER_DEV_CHAIN_CONFIG.id,
            rpcs: [{
                url: DOCKER_DEV_CHAIN_CONFIG.rpcEndpoints[0].url,
                timeout: toNumber(process.env.TEST_TIMEOUT) ?? 30 * 1000,
            }]
        },
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
