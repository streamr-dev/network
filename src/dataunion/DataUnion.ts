import { getAddress } from '@ethersproject/address'
import { BigNumber } from '@ethersproject/bignumber'
import { arrayify, hexZeroPad } from '@ethersproject/bytes'
import { Contract } from '@ethersproject/contracts'
import { TransactionReceipt, TransactionResponse } from '@ethersproject/providers'
import debug from 'debug'
import { Contracts } from './Contracts'
import StreamrClient from '../StreamrClient'
import { EthereumAddress, Todo } from '../types'
import { until, getEndpointUrl } from '../utils'
import authFetch from '../rest/authFetch'

export interface DataUnionDeployOptions {
    owner?: EthereumAddress,
    joinPartAgents?: EthereumAddress[],
    dataUnionName?: string,
    adminFee?: number,
    sidechainPollingIntervalMs?: number,
    sidechainRetryTimeoutMs?: number
    confirmations?: number
    gasPrice?: BigNumber
}

export enum JoinRequestState {
    PENDING = 'PENDING',
    ACCEPTED = 'ACCEPTED',
    REJECTED = 'REJECTED'
}

export interface JoinResponse {
    id: string
    state: JoinRequestState
}

export interface DataUnionWithdrawOptions {
    pollingIntervalMs?: number
    retryTimeoutMs?: number
    payForSignatureTransport?: boolean
}

export interface DataUnionMemberListModificationOptions {
    confirmations?: number
}

export interface DataUnionStats {
    activeMemberCount: BigNumber,
    inactiveMemberCount: BigNumber,
    joinPartAgentCount: BigNumber,
    totalEarnings: BigNumber,
    totalWithdrawable: BigNumber,
    lifetimeMemberEarnings: BigNumber
}

export enum MemberStatus {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
    NONE = 'NONE',
}

export interface MemberStats {
    status: MemberStatus
    earningsBeforeLastJoin: BigNumber
    totalEarnings: BigNumber
    withdrawableEarnings: BigNumber
}

const log = debug('StreamrClient::DataUnion')

export class DataUnion {

    contractAddress: EthereumAddress
    sidechainAddress: EthereumAddress
    client: StreamrClient

    constructor(contractAddress: EthereumAddress, sidechainAddress: EthereumAddress, client: StreamrClient) {
        // validate and convert to checksum case
        this.contractAddress = getAddress(contractAddress)
        this.sidechainAddress = getAddress(sidechainAddress)
        this.client = client
    }

    getAddress() {
        return this.contractAddress
    }

    getSidechainAddress() {
        return this.sidechainAddress
    }

    // Member functions

    /**
     * Send a joinRequest, or get into data union instantly with a data union secret
     */
    async join(secret?: string): Promise<Todo> {
        const memberAddress = this.client.getAddress() as string
        const body: any = {
            memberAddress
        }
        if (secret) { body.secret = secret }

        const url = getEndpointUrl(this.client.options.restUrl, 'dataunions', this.contractAddress, 'joinRequests')
        const response = await authFetch(
            url,
            this.client.session,
            {
                method: 'POST',
                body: JSON.stringify(body),
                headers: {
                    'Content-Type': 'application/json',
                },
            },
        )
        if (secret) {
            await until(async () => this.isMember(memberAddress))
        }
        return response
    }

    async isMember(memberAddress: EthereumAddress): Promise<boolean> {
        const address = getAddress(memberAddress)
        const duSidechain = await this.getContracts().getSidechainContractReadOnly(this.contractAddress)
        const ACTIVE = 1 // memberData[0] is enum ActiveStatus {None, Active, Inactive}
        const memberData = await duSidechain.memberData(address)
        const state = memberData[0]
        return (state === ACTIVE)
    }

    /**
     * Withdraw all your earnings
     * @returns receipt once withdraw is complete (tokens are seen in mainnet)
     */
    async withdrawAll(options?: DataUnionWithdrawOptions): Promise<TransactionReceipt> {
        const recipientAddress = this.client.getAddress()
        return this._executeWithdraw(
            () => this.getWithdrawAllTx(),
            recipientAddress,
            options
        )
    }

    /**
     * Get the tx promise for withdrawing all your earnings
     * @returns await on call .wait to actually send the tx
     */
    private async getWithdrawAllTx(): Promise<TransactionResponse> {
        const signer = await this.client.ethereum.getSidechainSigner()
        const address = await signer.getAddress()
        const duSidechain = await this.getContracts().getSidechainContract(this.contractAddress)

        const withdrawable = await duSidechain.getWithdrawableEarnings(address)
        if (withdrawable.eq(0)) {
            throw new Error(`${address} has nothing to withdraw in (sidechain) data union ${duSidechain.address}`)
        }

        if (this.client.options.minimumWithdrawTokenWei && withdrawable.lt(this.client.options.minimumWithdrawTokenWei)) {
            throw new Error(`${address} has only ${withdrawable} to withdraw in `
                + `(sidechain) data union ${duSidechain.address} (min: ${this.client.options.minimumWithdrawTokenWei})`)
        }
        return duSidechain.withdrawAll(address, true) // sendToMainnet=true
    }

    /**
     * Withdraw earnings and "donate" them to the given address
     * @returns get receipt once withdraw is complete (tokens are seen in mainnet)
     */
    async withdrawAllTo(
        recipientAddress: EthereumAddress,
        options?: DataUnionWithdrawOptions
    ): Promise<TransactionReceipt> {
        const to = getAddress(recipientAddress) // throws if bad address
        return this._executeWithdraw(
            () => this.getWithdrawAllToTx(to),
            to,
            options
        )
    }

    /**
     * Withdraw earnings and "donate" them to the given address
     * @param recipientAddress - the address to receive the tokens
     * @returns await on call .wait to actually send the tx
     */
    private async getWithdrawAllToTx(recipientAddress: EthereumAddress): Promise<TransactionResponse> {
        const signer = await this.client.ethereum.getSidechainSigner()
        const address = await signer.getAddress()
        const duSidechain = await this.getContracts().getSidechainContract(this.contractAddress)
        const withdrawable = await duSidechain.getWithdrawableEarnings(address)
        if (withdrawable.eq(0)) {
            throw new Error(`${address} has nothing to withdraw in (sidechain) data union ${duSidechain.address}`)
        }
        return duSidechain.withdrawAllTo(recipientAddress, true) // sendToMainnet=true
    }

    /**
     * Member can sign off to "donate" all earnings to another address such that someone else
     *   can submit the transaction (and pay for the gas)
     * This signature is only valid until next withdrawal takes place (using this signature or otherwise).
     * Note that while it's a "blank cheque" for withdrawing all earnings at the moment it's used, it's
     *   invalidated by the first withdraw after signing it. In other words, any signature can be invalidated
     *   by making a "normal" withdraw e.g. `await streamrClient.withdrawAll()`
     * Admin can execute the withdraw using this signature: ```
     *   await adminStreamrClient.withdrawAllToSigned(memberAddress, recipientAddress, signature)
     * ```
     * @param recipientAddress - the address authorized to receive the tokens
     * @returns signature authorizing withdrawing all earnings to given recipientAddress
     */
    async signWithdrawAllTo(recipientAddress: EthereumAddress): Promise<string> {
        return this.signWithdrawAmountTo(recipientAddress, BigNumber.from(0))
    }

    /**
     * Member can sign off to "donate" specific amount of earnings to another address such that someone else
     *   can submit the transaction (and pay for the gas)
     * This signature is only valid until next withdrawal takes place (using this signature or otherwise).
     * @param recipientAddress - the address authorized to receive the tokens
     * @param amountTokenWei - that the signature is for (can't be used for less or for more)
     * @returns signature authorizing withdrawing all earnings to given recipientAddress
     */
    async signWithdrawAmountTo(
        recipientAddress: EthereumAddress,
        amountTokenWei: BigNumber|number|string
    ): Promise<string> {
        const to = getAddress(recipientAddress) // throws if bad address
        const signer = this.client.ethereum.getSigner() // it shouldn't matter if it's mainnet or sidechain signer since key should be the same
        const address = await signer.getAddress()
        const duSidechain = await this.getContracts().getSidechainContractReadOnly(this.contractAddress)
        const memberData = await duSidechain.memberData(address)
        if (memberData[0] === '0') { throw new Error(`${address} is not a member in Data Union (sidechain address ${duSidechain.address})`) }
        const withdrawn = memberData[3]
        // @ts-expect-error
        const message = to + hexZeroPad(amountTokenWei, 32).slice(2) + duSidechain.address.slice(2) + hexZeroPad(withdrawn, 32).slice(2)
        const signature = await signer.signMessage(arrayify(message))
        return signature
    }

    // Query functions

    async getStats(): Promise<DataUnionStats> {
        const duSidechain = await this.getContracts().getSidechainContractReadOnly(this.contractAddress)
        const [
            totalEarnings,
            totalEarningsWithdrawn,
            activeMemberCount,
            inactiveMemberCount,
            lifetimeMemberEarnings,
            joinPartAgentCount,
        ] = await duSidechain.getStats()
        const totalWithdrawable = totalEarnings.sub(totalEarningsWithdrawn)
        return {
            activeMemberCount,
            inactiveMemberCount,
            joinPartAgentCount,
            totalEarnings,
            totalWithdrawable,
            lifetimeMemberEarnings,
        }
    }

    /**
     * Get stats of a single data union member
     */
    async getMemberStats(memberAddress: EthereumAddress): Promise<MemberStats> {
        const address = getAddress(memberAddress)
        // TODO: use duSidechain.getMemberStats(address) once it's implemented, to ensure atomic read
        //        (so that memberData is from same block as getEarnings, otherwise withdrawable will be foobar)
        const duSidechain = await this.getContracts().getSidechainContractReadOnly(this.contractAddress)
        const mdata = await duSidechain.memberData(address)
        const total = await duSidechain.getEarnings(address).catch(() => BigNumber.from(0))
        const withdrawnEarnings = mdata[3]
        const withdrawable = total ? total.sub(withdrawnEarnings) : BigNumber.from(0)
        const STATUSES = [MemberStatus.NONE, MemberStatus.ACTIVE, MemberStatus.INACTIVE]
        return {
            status: STATUSES[mdata[0]],
            earningsBeforeLastJoin: mdata[1],
            totalEarnings: total,
            withdrawableEarnings: withdrawable,
        }
    }

    /**
     * Get the amount of tokens the member would get from a successful withdraw
     */
    async getWithdrawableEarnings(memberAddress: EthereumAddress): Promise<BigNumber> {
        const address = getAddress(memberAddress)
        const duSidechain = await this.getContracts().getSidechainContractReadOnly(this.contractAddress)
        return duSidechain.getWithdrawableEarnings(address)
    }

    /**
     * Get data union admin fee fraction (between 0.0 and 1.0) that admin gets from each revenue event
     */
    async getAdminFee(): Promise<number> {
        const duMainnet = this.getContracts().getMainnetContractReadOnly(this.contractAddress)
        const adminFeeBN = await duMainnet.adminFeeFraction()
        return +adminFeeBN.toString() / 1e18
    }

    async getAdminAddress(): Promise<Todo> {
        const duMainnet = this.getContracts().getMainnetContractReadOnly(this.contractAddress)
        return duMainnet.owner()
    }

    /**
     * Figure out if given mainnet address is old DataUnion (v 1.0) or current 2.0
     * NOTE: Current version of streamr-client-javascript can only handle current version!
     */
    async getVersion(): Promise<number> {
        const provider = this.client.ethereum.getMainnetProvider()
        const du = new Contract(this.contractAddress, [{
            name: 'version',
            inputs: [],
            outputs: [{ type: 'uint256' }],
            stateMutability: 'view',
            type: 'function'
        }], provider)
        try {
            const version = await du.version()
            return +version
        } catch (e) {
            // "not a data union"
            return 0
        }
    }

    // Admin functions

    /**
     * Add a new data union secret
     */
    async createSecret(name: string = 'Untitled Data Union Secret'): Promise<string> {
        const url = getEndpointUrl(this.client.options.restUrl, 'dataunions', this.contractAddress, 'secrets')
        const res = await authFetch(
            url,
            this.client.session,
            {
                method: 'POST',
                body: JSON.stringify({
                    name
                }),
                headers: {
                    'Content-Type': 'application/json',
                },
            },
        )
        return res.secret
    }

    /**
     * Add given Ethereum addresses as data union members
     */
    async addMembers(
        memberAddressList: EthereumAddress[],
        options: DataUnionMemberListModificationOptions = {}
    ): Promise<TransactionReceipt> {
        const members = memberAddressList.map(getAddress) // throws if there are bad addresses
        const duSidechain = await this.getContracts().getSidechainContract(this.contractAddress)
        const tx = await duSidechain.addMembers(members)
        // TODO: wrap promise for better error reporting in case tx fails (parse reason, throw proper error)
        const { confirmations = 1 } = options
        return tx.wait(confirmations)
    }

    /**
     * Remove given members from data union
     */
    async removeMembers(
        memberAddressList: EthereumAddress[],
        options: DataUnionMemberListModificationOptions = {},
    ): Promise<TransactionReceipt> {
        const members = memberAddressList.map(getAddress) // throws if there are bad addresses
        const duSidechain = await this.getContracts().getSidechainContract(this.contractAddress)
        const tx = await duSidechain.partMembers(members)
        // TODO: wrap promise for better error reporting in case tx fails (parse reason, throw proper error)
        const { confirmations = 1 } = options
        return tx.wait(confirmations)
    }

    /**
     * Admin: withdraw earnings (pay gas) on behalf of a member
     * TODO: add test
     * @param memberAddress - the other member who gets their tokens out of the Data Union
     * @returns Receipt once withdraw transaction is confirmed
     */
    async withdrawAllToMember(
        memberAddress: EthereumAddress,
        options?: DataUnionWithdrawOptions
    ): Promise<TransactionReceipt> {
        const address = getAddress(memberAddress) // throws if bad address
        return this._executeWithdraw(
            () => this.getWithdrawAllToMemberTx(address),
            address,
            options
        )
    }

    /**
     * Admin: get the tx promise for withdrawing all earnings on behalf of a member
     * @param memberAddress - the other member who gets their tokens out of the Data Union
     * @returns await on call .wait to actually send the tx
     */
    private async getWithdrawAllToMemberTx(memberAddress: EthereumAddress): Promise<TransactionResponse> {
        const a = getAddress(memberAddress) // throws if bad address
        const duSidechain = await this.getContracts().getSidechainContract(this.contractAddress)
        return duSidechain.withdrawAll(a, true) // sendToMainnet=true
    }

    /**
     * Admin: Withdraw a member's earnings to another address, signed by the member
     * @param memberAddress - the member whose earnings are sent out
     * @param recipientAddress - the address to receive the tokens in mainnet
     * @param signature - from member, produced using signWithdrawAllTo
     * @returns receipt once withdraw transaction is confirmed
     */
    async withdrawAllToSigned(
        memberAddress: EthereumAddress,
        recipientAddress: EthereumAddress,
        signature: string,
        options?: DataUnionWithdrawOptions
    ): Promise<TransactionReceipt> {
        const from = getAddress(memberAddress) // throws if bad address
        const to = getAddress(recipientAddress)
        return this._executeWithdraw(
            () => this.getWithdrawAllToSignedTx(from, to, signature),
            to,
            options
        )
    }

    /**
     * Admin: Withdraw a member's earnings to another address, signed by the member
     * @param memberAddress - the member whose earnings are sent out
     * @param recipientAddress - the address to receive the tokens in mainnet
     * @param signature - from member, produced using signWithdrawAllTo
     * @returns await on call .wait to actually send the tx
     */
    private async getWithdrawAllToSignedTx(
        memberAddress: EthereumAddress,
        recipientAddress: EthereumAddress,
        signature: string,
    ): Promise<TransactionResponse> {
        const duSidechain = await this.getContracts().getSidechainContract(this.contractAddress)
        return duSidechain.withdrawAllToSigned(memberAddress, recipientAddress, true, signature) // sendToMainnet=true
    }

    /**
     * Admin: set admin fee (between 0.0 and 1.0) for the data union
     */
    async setAdminFee(newFeeFraction: number): Promise<Todo> {
        if (newFeeFraction < 0 || newFeeFraction > 1) {
            throw new Error('newFeeFraction argument must be a number between 0...1, got: ' + newFeeFraction)
        }
        const adminFeeBN = BigNumber.from((newFeeFraction * 1e18).toFixed()) // last 2...3 decimals are going to be gibberish
        const duMainnet = this.getContracts().getMainnetContract(this.contractAddress)
        const tx = await duMainnet.setAdminFee(adminFeeBN)
        return tx.wait()
    }

    /**
     * Create a new DataUnionMainnet contract to mainnet with DataUnionFactoryMainnet
     * This triggers DataUnionSidechain contract creation in sidechain, over the bridge (AMB)
     * @return that resolves when the new DU is deployed over the bridge to side-chain
     */
    static async _deploy(options: DataUnionDeployOptions = {}, client: StreamrClient): Promise<DataUnion> {
        const deployerAddress = client.getAddress()
        const {
            owner,
            joinPartAgents,
            dataUnionName,
            adminFee = 0,
            sidechainPollingIntervalMs = 1000,
            sidechainRetryTimeoutMs = 600000,
            confirmations = 1,
            gasPrice
        } = options

        let duName = dataUnionName
        if (!duName) {
            duName = `DataUnion-${Date.now()}` // TODO: use uuid
            log(`dataUnionName generated: ${duName}`)
        }

        if (adminFee < 0 || adminFee > 1) { throw new Error('options.adminFeeFraction must be a number between 0...1, got: ' + adminFee) }
        const adminFeeBN = BigNumber.from((adminFee * 1e18).toFixed()) // last 2...3 decimals are going to be gibberish

        const ownerAddress = (owner) ? getAddress(owner) : deployerAddress

        let agentAddressList
        if (Array.isArray(joinPartAgents)) {
            // getAddress throws if there's an invalid address in the array
            agentAddressList = joinPartAgents.map(getAddress)
        } else {
            // streamrNode needs to be joinPartAgent so that EE join with secret works (and join approvals from Marketplace UI)
            agentAddressList = [ownerAddress]
            if (client.options.streamrNodeAddress) {
                agentAddressList.push(getAddress(client.options.streamrNodeAddress))
            }
        }

        const contract = await new Contracts(client).deployDataUnion({
            ownerAddress,
            agentAddressList,
            duName,
            deployerAddress,
            adminFeeBN,
            sidechainRetryTimeoutMs,
            sidechainPollingIntervalMs,
            confirmations,
            gasPrice
        })
        return new DataUnion(contract.address, contract.sidechain.address, client)
    }

    // Internal functions

    static _fromContractAddress(contractAddress: string, client: StreamrClient) {
        const contracts = new Contracts(client)
        const sidechainAddress = contracts.getDataUnionSidechainAddress(getAddress(contractAddress)) // throws if bad address
        return new DataUnion(contractAddress, sidechainAddress, client)
    }

    static _fromName({ dataUnionName, deployerAddress }: { dataUnionName: string, deployerAddress: string}, client: StreamrClient) {
        const contracts = new Contracts(client)
        const contractAddress = contracts.getDataUnionMainnetAddress(dataUnionName, getAddress(deployerAddress)) // throws if bad address
        return DataUnion._fromContractAddress(contractAddress, client) // eslint-disable-line no-underscore-dangle
    }

    async _getContract() {
        const ret = this.getContracts().getMainnetContract(this.contractAddress)
        // @ts-expect-error
        ret.sidechain = await this.getContracts().getSidechainContract(this.contractAddress)
        return ret
    }

    private getContracts() {
        return new Contracts(this.client)
    }

    // template for withdraw functions
    // client could be replaced with AMB (mainnet and sidechain)
    private async _executeWithdraw(
        getWithdrawTxFunc: () => Promise<Todo & { events: any[] }>,
        recipientAddress: EthereumAddress,
        options: DataUnionWithdrawOptions = {}
    ): Promise<TransactionReceipt> {
        const {
            pollingIntervalMs = 1000,
            retryTimeoutMs = 60000,
            payForSignatureTransport = this.client.options.payForSignatureTransport
        }: any = options
        const getBalanceFunc = () => this.client.getTokenBalance(recipientAddress)
        const balanceBefore = await getBalanceFunc()
        const tx = await getWithdrawTxFunc()
        const tr = await tx.wait()
        if (payForSignatureTransport) {
            await this.getContracts().payForSignatureTransport(tr, options)
        }
        log(`Waiting for balance ${balanceBefore.toString()} to change`)
        await until(async () => !(await getBalanceFunc()).eq(balanceBefore), retryTimeoutMs, pollingIntervalMs)
        return tr
    }
}
