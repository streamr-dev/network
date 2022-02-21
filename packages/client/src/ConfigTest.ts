function toNumber(value: any): number | undefined {
    return (value !== undefined) ? Number(value) : undefined
}

const sideChainConfig = {
    name: 'streamr',
    rpcs: [{
        url: process.env.SIDECHAIN_URL || `http://${process.env.STREAMR_DOCKER_DEV_HOST || '10.200.10.1'}:8546`,
        timeout: toNumber(process.env.TEST_TIMEOUT) ?? 30 * 1000,
    }]
}

/**
 * Streamr client constructor options that work in the test environment
 */
export const ConfigTest = {
    auth: {
        privateKey: process.env.ETHEREUM_PRIVATE_KEY || '0xe5af7834455b7239881b85be89d905d6881dcb4751063897f12be1b0dd546bdb',
    },
    theGraphUrl: `http://${process.env.STREAMR_DOCKER_DEV_HOST || '10.200.10.1'}:8000/subgraphs/name/streamr-dev/network-contracts`,
    restUrl: process.env.REST_URL || `http://${process.env.STREAMR_DOCKER_DEV_HOST || 'localhost'}/api/v2`,
    streamrNodeAddress: '0xFCAd0B19bB29D4674531d6f115237E16AfCE377c',
    tokenAddress: process.env.TOKEN_ADDRESS || '0xbAA81A0179015bE47Ad439566374F2Bae098686F',
    tokenSidechainAddress: process.env.TOKEN_ADDRESS_SIDECHAIN || '0x73Be21733CC5D08e1a14Ea9a399fb27DB3BEf8fF',
    withdrawServerUrl: process.env.WITHDRAW_SERVER_URL || 'http://localhost:3000',
    binanceAdapterAddress: process.env.BINANCE_ADAPTER || '0xdc5F6368cd31330adC259386e78604a5E29E9415',
    streamRegistryChainAddress: '0x6cCdd5d866ea766f6DF5965aA98DeCCD629ff222',
    streamStorageRegistryChainAddress: '0xd04af489677001444280366Dd0885B03dAaDe71D',
    storageNodeRegistryChainAddress: '0x231b810D98702782963472e1D60a25496999E75D',
    dataUnion: {
        factoryMainnetAddress: process.env.DU_FACTORY_MAINNET || '0x4bbcBeFBEC587f6C4AF9AF9B48847caEa1Fe81dA',
        factorySidechainAddress: process.env.DU_FACTORY_SIDECHAIN || '0x4A4c4759eb3b7ABee079f832850cD3D0dC48D927',
        templateMainnetAddress: process.env.DU_TEMPLATE_MAINNET || '0x7bFBAe10AE5b5eF45e2aC396E0E605F6658eF3Bc',
        templateSidechainAddress: process.env.DU_TEMPLATE_SIDECHAIN || '0x36afc8c9283CC866b8EB6a61C6e6862a83cd6ee8',
    },
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
    },
    mainChainRPCs: {
        name: 'dev_ethereum',
        rpcs: [{
            url: process.env.ETHEREUM_SERVER_URL || `http://${process.env.STREAMR_DOCKER_DEV_HOST || '10.200.10.1'}:8545`,
            timeout: toNumber(process.env.TEST_TIMEOUT) ?? 30 * 1000
        }]
    },
    streamRegistryChainRPCs: sideChainConfig,
    dataUnionChainRPCs: sideChainConfig,
    autoConnect: false,
    autoDisconnect: false,
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
