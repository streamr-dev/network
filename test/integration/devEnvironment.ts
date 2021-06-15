import { Wallet } from 'ethers'
import { JsonRpcProvider } from '@ethersproject/providers'
import { id } from 'ethers/lib/utils'
import clientOptionsConfig from './config'

export const clientOptions = clientOptionsConfig

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
