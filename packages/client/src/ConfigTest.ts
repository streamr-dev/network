import { StreamrClientConfig } from './Config'
import { toEthereumAddress } from '@streamr/utils'

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
        layer0: {
            entryPoints: [{
                kademliaId: 'entryPointBroker',
                type: 0,
                websocket: {
                    ip: '127.0.0.1',
                    port: 40401
                }
            }],
            peerDescriptor: {
                kademliaId: 'local',
                type: 0
            },
            iceServers: [],
            webrtcDisallowPrivateAddresses: false
        }
    },
    contracts: {
        streamRegistryChainAddress: '0x6cCdd5d866ea766f6DF5965aA98DeCCD629ff222',
        streamStorageRegistryChainAddress: '0xd04af489677001444280366Dd0885B03dAaDe71D',
        storageNodeRegistryChainAddress: '0x231b810D98702782963472e1D60a25496999E75D',    
        mainChainRPCs: {
            name: 'dev_ethereum',
            chainId: 8995,
            rpcs: [{
                url: process.env.ETHEREUM_SERVER_URL || `http://${process.env.STREAMR_DOCKER_DEV_HOST || '127.0.0.1'}:8545`,
                timeout: toNumber(process.env.TEST_TIMEOUT) ?? 30 * 1000
            }]
        },
        streamRegistryChainRPCs: sideChainConfig,
        theGraphUrl: `http://${process.env.STREAMR_DOCKER_DEV_HOST || '127.0.0.1'}:8000/subgraphs/name/streamr-dev/network-contracts`,
    },
    _timeouts: {
        theGraph: {
            timeout: 10 * 1000,
            retryInterval: 500
        },
        storageNode: {
            timeout: 30 * 1000,
            retryInterval: 500
        },
        ensStreamCreation: {
            timeout: 20 * 1000,
            retryInterval: 500
        },
        httpFetchTimeout: 30 * 1000
    },
    metrics: false
}

export const DOCKER_DEV_STORAGE_NODE = toEthereumAddress('0xde1112f631486CfC759A50196853011528bC5FA0')
