function toNumber(value: any): number | undefined {
    return (value !== undefined) ? Number(value) : undefined
}

const sideChainConfig = {
    name: 'streamr',
    chainId: 8995,
    rpcs: [{
        url: process.env.SIDECHAIN_URL || `http://${process.env.STREAMR_DOCKER_DEV_HOST || '10.200.10.1'}:8546`,
        timeout: toNumber(process.env.TEST_TIMEOUT) ?? 30 * 1000,
    }]
}

/**
 * Streamr client constructor options that work in the test environment
 */
export const ConfigTest = {
    theGraphUrl: `http://${process.env.STREAMR_DOCKER_DEV_HOST || '10.200.10.1'}:8000/subgraphs/name/streamr-dev/network-contracts`,
    streamrNodeAddress: '0xFCAd0B19bB29D4674531d6f115237E16AfCE377c',
    streamRegistryChainAddress: '0x6cCdd5d866ea766f6DF5965aA98DeCCD629ff222',
    streamStorageRegistryChainAddress: '0xd04af489677001444280366Dd0885B03dAaDe71D',
    storageNodeRegistryChainAddress: '0x231b810D98702782963472e1D60a25496999E75D',
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
    mainChainRPCs: {
        name: 'dev_ethereum',
        chainId: 8995,
        rpcs: [{
            url: process.env.ETHEREUM_SERVER_URL || `http://${process.env.STREAMR_DOCKER_DEV_HOST || '10.200.10.1'}:8545`,
            timeout: toNumber(process.env.TEST_TIMEOUT) ?? 30 * 1000
        }]
    },
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
