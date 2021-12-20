import { inject, scoped, Lifecycle } from 'tsyringe'

import Ethereum from '../Ethereum'
import { Rest } from '../Rest'
import { StrictBrubeckClientConfig, Config } from '../Config'
import { EthereumAddress } from '../types'
import { DataUnion, DataUnionDeployOptions } from './DataUnion'
import { BigNumber } from '@ethersproject/bignumber'
import { getAddress } from '@ethersproject/address'
import { Contract } from '@ethersproject/contracts'
import Contracts from './Contracts'

import { BytesLike } from '@ethersproject/bytes'

const balanceOfAbi = [{
    name: 'balanceOf',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
    constant: true,
    payable: false,
    stateMutability: 'view',
    type: 'function'
}]

@scoped(Lifecycle.ContainerScoped)
export default class DataUnionAPI {
    constructor(
        public ethereum: Ethereum,
        public rest: Rest,
        @inject(Config.Root) public options: StrictBrubeckClientConfig,
    ) {

    }
    /**
     * Get token balance in "wei" (10^-18 parts) for given address
     */
    async getTokenBalance(address: EthereumAddress): Promise<BigNumber> {
        const { tokenAddress } = this.options
        const addr = getAddress(address)
        const provider = this.ethereum.getMainnetProvider()
        const token = new Contract(tokenAddress, balanceOfAbi, provider)
        return token.balanceOf(addr)
    }

    /**
     * Get token balance in "wei" (10^-18 parts) for given address in sidechain
     */
    async getSidechainTokenBalance(address: EthereumAddress): Promise<BigNumber> {
        const { tokenSidechainAddress } = this.options
        const addr = getAddress(address)
        const provider = this.ethereum.getSidechainProvider()
        const token = new Contract(tokenSidechainAddress, balanceOfAbi, provider)
        return token.balanceOf(addr)
    }

    getDataUnion(contractAddress: EthereumAddress) {
        return DataUnion._fromContractAddress(contractAddress, this) // eslint-disable-line no-underscore-dangle
    }

    async safeGetDataUnion(contractAddress: EthereumAddress) {
        const du = DataUnion._fromContractAddress(contractAddress, this) // eslint-disable-line no-underscore-dangle
        const version = await du.getVersion()
        if (version === 0) {
            throw new Error(`${contractAddress} is not a Data Union!`)
        } else if (version === 1) {
            throw new Error(`${contractAddress} is an old Data Union, please use StreamrClient 4.x or earlier!`)
        } else if (version === 2) {
            return du
        }
        throw new Error(`${contractAddress} is an unknown Data Union version "${version}"`)
    }

    async deployDataUnion(options?: DataUnionDeployOptions) {
        return DataUnion._deploy(options, this) // eslint-disable-line no-underscore-dangle
    }

    async setBinanceDepositAddress(binanceRecipient: EthereumAddress) {
        return DataUnion._setBinanceDepositAddress(binanceRecipient, this) // eslint-disable-line no-underscore-dangle
    }

    async setBinanceDepositAddressFromSignature(from: EthereumAddress, binanceRecipient: EthereumAddress, signature: BytesLike) {
        return DataUnion._setBinanceDepositAddressFromSignature(from, binanceRecipient, signature, this) // eslint-disable-line no-underscore-dangle
    }

    // TODO: define returned object's type
    async setBinanceDepositAddressViaWithdrawServer(from: EthereumAddress, binanceRecipient: EthereumAddress, signature: BytesLike): Promise<object> {
        const body = {
            memberAddress: from,
            binanceRecipientAddress: binanceRecipient,
            signature
        }
        return this.rest.post(['binanceAdapterSetRecipient'], body, {
            restUrl: this.options.withdrawServerUrl,
        })
    }

    async getBinanceDepositAddress(userAddress: EthereumAddress) {
        return DataUnion._getBinanceDepositAddress(userAddress, this) // eslint-disable-line no-underscore-dangle
    }

    async signSetBinanceRecipient(
        recipientAddress: EthereumAddress,
    ): Promise<string> {
        const to = getAddress(recipientAddress) // throws if bad address
        const signer = this.ethereum.getSigner()
        return DataUnion._createSetBinanceRecipientSignature(to, signer, new Contracts(this)) // eslint-disable-line no-underscore-dangle
    }

    /** @internal */
    _getDataUnionFromName({ dataUnionName, deployerAddress }: { dataUnionName: string, deployerAddress: EthereumAddress}) {
        return DataUnion._fromName({ // eslint-disable-line no-underscore-dangle
            dataUnionName,
            deployerAddress
        }, this)
    }
}
