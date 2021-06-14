import { Wallet } from 'ethers'
import { JsonRpcProvider } from '@ethersproject/providers';
import { id } from 'ethers/lib/utils'

const toNumber = (value: any) => {
    return (value !== undefined) ? Number(value) : undefined
}

export const clientOptions = {
    // ganache 1: 0x4178baBE9E5148c6D5fd431cD72884B07Ad855a0
    auth: {
        privateKey: process.env.ETHEREUM_PRIVATE_KEY || '0xe5af7834455b7239881b85be89d905d6881dcb4751063897f12be1b0dd546bdb',
    },
    url: process.env.WEBSOCKET_URL || `ws://${process.env.STREAMR_DOCKER_DEV_HOST || 'localhost'}/api/v1/ws`,
    restUrl: process.env.REST_URL || `http://${process.env.STREAMR_DOCKER_DEV_HOST || 'localhost'}/api/v1`,
    streamrNodeAddress: '0xFCAd0B19bB29D4674531d6f115237E16AfCE377c',
    tokenAddress: process.env.TOKEN_ADDRESS || '0xbAA81A0179015bE47Ad439566374F2Bae098686F',
    tokenSidechainAddress: process.env.TOKEN_ADDRESS_SIDECHAIN || '0x73Be21733CC5D08e1a14Ea9a399fb27DB3BEf8fF',
    dataUnion: {
        factoryMainnetAddress: process.env.DU_FACTORY_MAINNET || '0x4bbcBeFBEC587f6C4AF9AF9B48847caEa1Fe81dA',
        factorySidechainAddress: process.env.DU_FACTORY_SIDECHAIN || '0x4A4c4759eb3b7ABee079f832850cD3D0dC48D927',
        templateMainnetAddress: process.env.DU_TEMPLATE_MAINNET || '0x7bFBAe10AE5b5eF45e2aC396E0E605F6658eF3Bc',
        templateSidechainAddress: process.env.DU_TEMPLATE_SIDECHAIN || '0x36afc8c9283CC866b8EB6a61C6e6862a83cd6ee8',
    },
    storageNode: {
        address: '0xde1112f631486CfC759A50196853011528bC5FA0',
        url: `http://${process.env.STREAMR_DOCKER_DEV_HOST || '10.200.10.1'}:8891`
    },
    sidechain: {
        url: process.env.SIDECHAIN_URL || `http://${process.env.STREAMR_DOCKER_DEV_HOST || '10.200.10.1'}:8546`,
        timeout: toNumber(process.env.TEST_TIMEOUT),
    },
    mainnet: {
        url: process.env.ETHEREUM_SERVER_URL || `http://${process.env.STREAMR_DOCKER_DEV_HOST || '10.200.10.1'}:8545`,
        timeout: toNumber(process.env.TEST_TIMEOUT),
    },
    autoConnect: false,
    autoDisconnect: false,
}

export const tokenMediatorAddress = '0xedD2aa644a6843F2e5133Fe3d6BD3F4080d97D9F'

// can mint mainnet DATA tokens
export const tokenAdminPrivateKey = '0x5e98cce00cff5dea6b454889f359a4ec06b9fa6b88e9d69b86de8e1c81887da0'

export const providerSidechain = new JsonRpcProvider(clientOptions.sidechain)
export const providerMainnet = new JsonRpcProvider(clientOptions.mainnet)

export function getTestWallet(index: number, provider: JsonRpcProvider) {
    // TODO: change to 'streamr-client-javascript' once https://github.com/streamr-dev/smart-contracts-init/pull/36 is in docker
    const hash = id(`marketplace-contracts${index}`)
    return new Wallet(hash, provider)
}

export function getMainnetTestWallet(index: number) {
    return getTestWallet(index, providerMainnet)
}

export function getSidechainTestWallet(index: number) {
    return getTestWallet(index, providerSidechain)
}

export const relayTokensAbi = [
    {
        inputs: [
            {
                internalType: 'address',
                name: 'token',
                type: 'address'
            },
            {
                internalType: 'address',
                name: '_receiver',
                type: 'address'
            },
            {
                internalType: 'uint256',
                name: '_value',
                type: 'uint256'
            },
            {
                internalType: 'bytes',
                name: '_data',
                type: 'bytes'
            }
        ],
        name: 'relayTokensAndCall',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function'
    }
]
