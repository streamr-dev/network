import { inject, scoped, Lifecycle } from 'tsyringe'

import { BigNumber } from '@ethersproject/bignumber'
import { BytesLike, hexZeroPad } from '@ethersproject/bytes'
import { Contract } from '@ethersproject/contracts'
import { keccak256 } from '@ethersproject/keccak256'

import { EthereumAddress } from 'streamr-client-protocol'

import Ethereum from '../Ethereum'
import { Rest } from '../Rest'
import { StrictBrubeckClientConfig, Config } from '../Config'
import { DataUnion, DataUnionDeployOptions } from './DataUnion'
import { getAddress, getCreate2Address, isAddress } from '@ethersproject/address'
import Contracts from './Contracts'
import { defaultAbiCoder } from '@ethersproject/abi'

import { factoryMainnetABI } from './abi'

import { Debug } from '../utils/log'
import { parseEther } from '@ethersproject/units'
import { until } from '../utils'

const log = Debug('DataUnionAPI')

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
        const provider = this.ethereum.getDataUnionChainProvider()
        const token = new Contract(tokenSidechainAddress, balanceOfAbi, provider)
        return token.balanceOf(addr)
    }

    /**
     * NOTE: if template address is not given, calculation only works for the newest currently deployed factory,
     *       i.e. can be used for "future deployments" but NOT for old deployments
     * For old deployments, please use getDataUnion
     */
    async calculateDataUnionAddresses(
        dataUnionName: string,
        deployerAddress?: EthereumAddress
    ): Promise<{ mainnetAddress: EthereumAddress, sidechainAddress: EthereumAddress }> {
        const deployer = deployerAddress ?? await this.ethereum.getAddress()
        const {
            templateMainnetAddress,
            templateSidechainAddress,
            factoryMainnetAddress,
            factorySidechainAddress,
        } = this.options.dataUnion
        // The magic hex strings come from https://github.com/streamr-dev/data-union-solidity/blob/master/contracts/CloneLib.sol#L19
        const salt = keccak256(defaultAbiCoder.encode(['string', 'address'], [dataUnionName, deployer]))
        const codeHashM = keccak256(`0x3d602d80600a3d3981f3363d3d373d3d3d363d73${templateMainnetAddress.slice(2)}5af43d82803e903d91602b57fd5bf3`)
        const mainnetAddress = getCreate2Address(factoryMainnetAddress, salt, codeHashM)
        const codeHashS = keccak256(`0x3d602d80600a3d3981f3363d3d373d3d3d363d73${templateSidechainAddress.slice(2)}5af43d82803e903d91602b57fd5bf3`)
        const sidechainAddress = getCreate2Address(factorySidechainAddress, hexZeroPad(mainnetAddress, 32), codeHashS)
        return { mainnetAddress, sidechainAddress }
    }

    async getDataUnion(contractAddress: EthereumAddress): Promise<DataUnion> {
        if (!isAddress(contractAddress)) {
            throw new Error(`Can't get Data Union, invalid Ethereum address: ${contractAddress}`)
        }
        const version = await DataUnion.getVersion(contractAddress, this)
        if (version === 0) {
            throw new Error(`${contractAddress} is not a Data Union!`)
        } else if (version === 1) {
            throw new Error(`${contractAddress} is an old Data Union, please use StreamrClient 4.x or earlier!`)
        } else if (version === 2) {
            const contracts = new Contracts(this)
            const sidechainContract = await contracts.getSidechainContractReadOnly(contractAddress)
            return new DataUnion(contractAddress, sidechainContract.address, this)
        }
        throw new Error(`${contractAddress} is an unknown Data Union version "${version}"`)
    }

    /**
     * Create a new DataUnionMainnet contract to mainnet with DataUnionFactoryMainnet
     * This triggers DataUnionSidechain contract creation in sidechain, over the bridge (AMB)
     * @return Promise<DataUnion> that resolves when the new DU is deployed over the bridge to side-chain
     */
    async deployDataUnion(options: DataUnionDeployOptions = {}): Promise<DataUnion> {
        const deployerAddress = await this.ethereum.getAddress()
        const mainnetProvider = this.ethereum.getMainnetProvider()
        const mainnetWallet = this.ethereum.getSigner()
        const duChainProvider = this.ethereum.getDataUnionChainProvider()

        const {
            factoryMainnetAddress
        } = this.options.dataUnion

        const {
            owner = deployerAddress,
            joinPartAgents = [owner, this.options.streamrNodeAddress],
            dataUnionName = `DataUnion-${Date.now()}`, // TODO: use uuid
            adminFee = 0,
            sidechainPollingIntervalMs = 1000,
            sidechainRetryTimeoutMs = 600000,
            confirmations = 1,
            gasPrice
        } = options

        log(`Going to deploy Data Union with name: ${dataUnionName}`)

        if (adminFee < 0 || adminFee > 1) { throw new Error('options.adminFeeFraction must be a number between 0...1, got: ' + adminFee) }
        const adminFeeBN = BigNumber.from((adminFee * 1e18).toFixed()) // last 2...3 decimals are going to be gibberish

        const ownerAddress = getAddress(owner)
        const agentAddressList = joinPartAgents.map(getAddress)

        const {
            mainnetAddress,
            sidechainAddress,
        } = await this.calculateDataUnionAddresses(dataUnionName, deployerAddress)

        if (await mainnetProvider.getCode(mainnetAddress) !== '0x') {
            throw new Error(`Mainnet data union "${dataUnionName}" contract ${mainnetAddress} already exists!`)
        }

        if (await mainnetProvider.getCode(factoryMainnetAddress) === '0x') {
            throw new Error(`Contract not found at ${factoryMainnetAddress}, check StreamrClient.options.dataUnion.factoryMainnetAddress!`)
        }

        const factoryMainnet = new Contract(factoryMainnetAddress, factoryMainnetABI, mainnetWallet)
        const ethersOptions: any = {}
        if (gasPrice) { ethersOptions.gasPrice = gasPrice }
        const duFeeFraction = parseEther('0') // TODO: decide what the default values should be
        const duBeneficiary = '0x0000000000000000000000000000000000000000' // TODO: decide what the default values should be
        const tx = await factoryMainnet.deployNewDataUnion(
            ownerAddress,
            adminFeeBN,
            duFeeFraction,
            duBeneficiary,
            agentAddressList,
            dataUnionName,
            ethersOptions
        )
        await tx.wait(confirmations)

        log(`Data Union deployed to mainnet: ${mainnetAddress}, waiting for sidechain: ${sidechainAddress}`)
        await until(
            async () => await duChainProvider.getCode(sidechainAddress) !== '0x',
            sidechainRetryTimeoutMs,
            sidechainPollingIntervalMs
        )

        return new DataUnion(mainnetAddress, sidechainAddress, this)
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
}
