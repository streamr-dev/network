import { toEthereumAddress } from '@streamr/utils'
import { StreamrClientConfig } from './Config'
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
            entryPoints: CHAIN_CONFIG.dev2.entryPoints,
            websocketPortRange: {
                min: 32400,
                max: 32800
            },
            iceServers: [],
            webrtcAllowPrivateAddresses: true,
            websocketServerEnableTls: false
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
        theGraphUrl: DOCKER_DEV_CHAIN_CONFIG.theGraphUrl,
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
