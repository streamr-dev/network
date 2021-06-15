import { getAddress } from '@ethersproject/address'
import { BigNumber } from '@ethersproject/bignumber'
import { arrayify, hexZeroPad } from '@ethersproject/bytes'
import { Contract, ContractReceipt, ContractTransaction } from '@ethersproject/contracts'
import { keccak256 } from '@ethersproject/keccak256'
import { Wallet } from '@ethersproject/wallet'
import { JsonRpcSigner } from '@ethersproject/providers'
import debug from 'debug'

import { StreamrClient } from '../StreamrClient'
import { EthereumAddress } from '../types'
import { until, getEndpointUrl, sleep } from '../utils'
import authFetch from '../rest/authFetch'

import { Contracts } from './Contracts'
import { erc20AllowanceAbi } from './abi'

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
    payForTransport?: boolean
    waitUntilTransportIsComplete?: boolean
    sendToMainnet?: boolean
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

export type AmbMessageHash = string

const log = debug('StreamrClient::DataUnion')

function getMessageHashes(tr: ContractReceipt): AmbMessageHash[] {
    // event UserRequestForSignature(bytes32 indexed messageId, bytes encodedData);
    const sigEventArgsArray = tr.events!.filter((e) => e.event === 'UserRequestForSignature').map((e) => e.args)
    const hashes = sigEventArgsArray.map((eventArgs) => keccak256(eventArgs![1]))
    return hashes
}

type WaitForTXOptions = {
    retries?: number
    retryInterval?: number
}

async function waitForTx(tx: ContractTransaction, { retries = 60, retryInterval = 60000 }: WaitForTXOptions = {}): Promise<ContractReceipt> {
    return tx.wait().catch((err) => {
        log('Attempted transaction: %o', tx)
        log('Got error: %o', err)
        if (err.body) {
            const body = JSON.parse(err.body)
            const msg = body.error.message
            log('Error message: %s', msg)
            if (retries > 0 && msg.includes('ancient block sync')) {
                log('Sleeping for %dms then retrying %d more time(s).', retryInterval, retries)
                return sleep(retryInterval).then(() => waitForTx(tx, { retries: retries - 1, retryInterval }))
            }
        }
        throw err
    })
}

/**
 * @category Important
 */
export class DataUnion {

    private contractAddress: EthereumAddress
    private sidechainAddress: EthereumAddress
    private client: StreamrClient

    /** @internal */
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
    async join(secret?: string): Promise<JoinResponse> {
        const memberAddress = await this.client.getAddress()
        const body: any = {
            memberAddress
        }
        if (secret) { body.secret = secret }

        const url = getEndpointUrl(this.client.options.restUrl, 'dataunions', this.contractAddress, 'joinRequests')
        const response = await authFetch<JoinResponse>(
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
        const memberData = await duSidechain.memberData(address)
        const state = memberData[0]
        const ACTIVE = 1 // memberData[0] is enum ActiveStatus {None, Active, Inactive}
        return (state === ACTIVE)
    }

    /**
     * Withdraw all your earnings
     * @returns the sidechain withdraw transaction receipt IF called with sendToMainnet=false,
     *          ELSE the message hash IF called with payForTransport=false and waitUntilTransportIsComplete=false,
     *          ELSE the mainnet AMB signature execution transaction receipt IF we did the transport ourselves,
     *          ELSE null IF transport to mainnet was done by someone else (in which case the receipt is lost)
     */
    async withdrawAll(options?: DataUnionWithdrawOptions) {
        const recipientAddress = await this.client.getAddress()
        return this._executeWithdraw(
            () => this.getWithdrawAllTx(options?.sendToMainnet),
            recipientAddress,
            options
        )
    }

    /**
     * Get the tx promise for withdrawing all your earnings
     * @returns await on call .wait to actually send the tx
     */
    private async getWithdrawAllTx(sendToMainnet: boolean = true): Promise<ContractTransaction> {
        const signer = await this.client.ethereum.getSidechainSigner()
        const address = await signer.getAddress()
        const duSidechain = await this.getContracts().getSidechainContract(this.contractAddress)

        const withdrawable = await duSidechain.getWithdrawableEarnings(address)
        if (withdrawable.eq(0)) {
            throw new Error(`${address} has nothing to withdraw in (sidechain) data union ${duSidechain.address}`)
        }

        if (this.client.options.dataUnion.minimumWithdrawTokenWei && withdrawable.lt(this.client.options.dataUnion.minimumWithdrawTokenWei)) {
            throw new Error(`${address} has only ${withdrawable} to withdraw in `
                + `(sidechain) data union ${duSidechain.address} (min: ${this.client.options.dataUnion.minimumWithdrawTokenWei})`)
        }
        return duSidechain.withdrawAll(address, sendToMainnet)
    }

    /**
     * Withdraw earnings and "donate" them to the given address
     * @returns the sidechain withdraw transaction receipt IF called with sendToMainnet=false,
     *          ELSE the message hash IF called with payForTransport=false and waitUntilTransportIsComplete=false,
     *          ELSE the mainnet AMB signature execution transaction receipt IF we did the transport ourselves,
     *          ELSE null IF transport to mainnet was done by someone else (in which case the receipt is lost)
     */
    async withdrawAllTo(
        recipientAddress: EthereumAddress,
        options?: DataUnionWithdrawOptions
    ) {
        const to = getAddress(recipientAddress) // throws if bad address
        return this._executeWithdraw(
            () => this.getWithdrawAllToTx(to, options?.sendToMainnet),
            to,
            options
        )
    }

    /**
     * Withdraw earnings and "donate" them to the given address
     * @param recipientAddress - the address to receive the tokens
     * @returns await on call .wait to actually send the tx
     */
    private async getWithdrawAllToTx(recipientAddress: EthereumAddress, sendToMainnet: boolean = true): Promise<ContractTransaction> {
        const signer = await this.client.ethereum.getSidechainSigner()
        const address = await signer.getAddress()
        const duSidechain = await this.getContracts().getSidechainContract(this.contractAddress)
        const withdrawable = await duSidechain.getWithdrawableEarnings(address)
        if (withdrawable.eq(0)) {
            throw new Error(`${address} has nothing to withdraw in (sidechain) data union ${duSidechain.address}`)
        }
        return duSidechain.withdrawAllTo(recipientAddress, sendToMainnet)
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
        return this._createWithdrawSignature(amountTokenWei, to, withdrawn, signer)
    }

    /** @internal */
    async _createWithdrawSignature(
        amountTokenWei: BigNumber|number|string,
        to: EthereumAddress,
        withdrawn: BigNumber,
        signer: Wallet | JsonRpcSigner
    ) {
        const message = to
            + hexZeroPad(BigNumber.from(amountTokenWei).toHexString(), 32).slice(2)
            + this.getSidechainAddress().slice(2)
            + hexZeroPad(withdrawn.toHexString(), 32).slice(2)
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
        const [memberData, total] = await Promise.all([
            duSidechain.memberData(address),
            duSidechain.getEarnings(address).catch(() => BigNumber.from(0)),
        ])
        const withdrawnEarnings = memberData[3]
        const withdrawable = total ? total.sub(withdrawnEarnings) : BigNumber.from(0)
        const STATUSES = [MemberStatus.NONE, MemberStatus.ACTIVE, MemberStatus.INACTIVE]
        return {
            status: STATUSES[memberData[0]],
            earningsBeforeLastJoin: memberData[1],
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

    async getAdminAddress(): Promise<EthereumAddress> {
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
        const res = await authFetch<{secret: string}>(
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
    ) {
        const members = memberAddressList.map(getAddress) // throws if there are bad addresses
        const duSidechain = await this.getContracts().getSidechainContract(this.contractAddress)
        const tx = await duSidechain.addMembers(members)
        // TODO ETH-93: wrap promise for better error reporting in case tx fails (parse reason, throw proper error)
        return waitForTx(tx)
    }

    /**
     * Remove given members from data union
     */
    async removeMembers(
        memberAddressList: EthereumAddress[],
    ) {
        const members = memberAddressList.map(getAddress) // throws if there are bad addresses
        const duSidechain = await this.getContracts().getSidechainContract(this.contractAddress)
        const tx = await duSidechain.partMembers(members)
        // TODO ETH-93: wrap promise for better error reporting in case tx fails (parse reason, throw proper error)
        return waitForTx(tx)
    }

    /**
     * Admin: withdraw earnings (pay gas) on behalf of a member
     * TODO: add test
     * @param memberAddress - the other member who gets their tokens out of the Data Union
     * @returns the sidechain withdraw transaction receipt IF called with sendToMainnet=false,
     *          ELSE the message hash IF called with payForTransport=false and waitUntilTransportIsComplete=false,
     *          ELSE the mainnet AMB signature execution transaction receipt IF we did the transport ourselves,
     *          ELSE null IF transport to mainnet was done by someone else (in which case the receipt is lost)
     */
    async withdrawAllToMember(
        memberAddress: EthereumAddress,
        options?: DataUnionWithdrawOptions
    ) {
        const address = getAddress(memberAddress) // throws if bad address
        return this._executeWithdraw(
            () => this.getWithdrawAllToMemberTx(address, options?.sendToMainnet),
            address,
            options
        )
    }

    /**
     * Admin: get the tx promise for withdrawing all earnings on behalf of a member
     * @param memberAddress - the other member who gets their tokens out of the Data Union
     * @returns await on call .wait to actually send the tx
     */
    private async getWithdrawAllToMemberTx(memberAddress: EthereumAddress, sendToMainnet: boolean = true): Promise<ContractTransaction> {
        const a = getAddress(memberAddress) // throws if bad address
        const duSidechain = await this.getContracts().getSidechainContract(this.contractAddress)
        return duSidechain.withdrawAll(a, sendToMainnet)
    }

    /**
     * Admin: Withdraw a member's earnings to another address, signed by the member
     * @param memberAddress - the member whose earnings are sent out
     * @param recipientAddress - the address to receive the tokens in mainnet
     * @param signature - from member, produced using signWithdrawAllTo
     * @returns the sidechain withdraw transaction receipt IF called with sendToMainnet=false,
     *          ELSE the message hash IF called with payForTransport=false and waitUntilTransportIsComplete=false,
     *          ELSE the mainnet AMB signature execution transaction receipt IF we did the transport ourselves,
     *          ELSE null IF transport to mainnet was done by someone else (in which case the receipt is lost)
     */
    async withdrawAllToSigned(
        memberAddress: EthereumAddress,
        recipientAddress: EthereumAddress,
        signature: string,
        options?: DataUnionWithdrawOptions
    ) {
        const from = getAddress(memberAddress) // throws if bad address
        const to = getAddress(recipientAddress)
        return this._executeWithdraw(
            () => this.getWithdrawAllToSignedTx(from, to, signature, options?.sendToMainnet),
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
        sendToMainnet: boolean = true,
    ) {
        const duSidechain = await this.getContracts().getSidechainContract(this.contractAddress)
        return duSidechain.withdrawAllToSigned(memberAddress, recipientAddress, sendToMainnet, signature)
    }

    /**
     * Admin: set admin fee (between 0.0 and 1.0) for the data union
     */
    async setAdminFee(newFeeFraction: number) {
        if (newFeeFraction < 0 || newFeeFraction > 1) {
            throw new Error('newFeeFraction argument must be a number between 0...1, got: ' + newFeeFraction)
        }
        const adminFeeBN = BigNumber.from((newFeeFraction * 1e18).toFixed()) // last 2...3 decimals are going to be gibberish
        const duMainnet = this.getContracts().getMainnetContract(this.contractAddress)
        const tx = await duMainnet.setAdminFee(adminFeeBN)
        return waitForTx(tx)
    }

    /**
     * Transfer amount to specific member in DataunionSidechain
     * @param memberAddress - the other member who gets their tokens out of the Data Union
     * @param amountTokenWei - the amount that want to add to the member
     * @returns receipt once transfer transaction is confirmed
     */
    async transferToMemberInContract(
        memberAddress: EthereumAddress,
        amountTokenWei: BigNumber|number|string
    ): Promise<ContractReceipt> {
        const address = getAddress(memberAddress) // throws if bad address
        const amount = BigNumber.from(amountTokenWei)
        const duSidechain = await this.getContracts().getSidechainContract(this.contractAddress)

        // check first that we have enough allowance to do the transferFrom within the transferToMemberInContract
        const tokenSidechainAddress = await duSidechain.token()
        const sidechainProvider = this.client.ethereum.getSidechainProvider()
        const token = new Contract(tokenSidechainAddress, erc20AllowanceAbi, sidechainProvider)
        const allowance = await token.allowance(await duSidechain.signer.getAddress(), duSidechain.address)
        if (allowance.lt(amount)) {
            const difference = amount.sub(allowance)
            const approveTx = token.increaseAllowance(duSidechain.address, difference)
            const approveTr = await waitForTx(approveTx)
            log('Approval transaction receipt: %o', approveTr)
        }

        const tx = await duSidechain.transferToMemberInContract(address, amount)
        return waitForTx(tx)
    }

    /**
     * Create a new DataUnionMainnet contract to mainnet with DataUnionFactoryMainnet
     * This triggers DataUnionSidechain contract creation in sidechain, over the bridge (AMB)
     * @return that resolves when the new DU is deployed over the bridge to side-chain
     * @internal
     */
    static async _deploy(options: DataUnionDeployOptions = {}, client: StreamrClient): Promise<DataUnion> {
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
        const deployerAddress = await client.getAddress()

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
            agentAddressList.push(getAddress(client.options.streamrNodeAddress))
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

    /** @internal */
    static _fromContractAddress(contractAddress: string, client: StreamrClient) {
        const contracts = new Contracts(client)
        const sidechainAddress = contracts.getDataUnionSidechainAddress(getAddress(contractAddress)) // throws if bad address
        return new DataUnion(contractAddress, sidechainAddress, client)
    }

    /** @internal */
    static _fromName({ dataUnionName, deployerAddress }: { dataUnionName: string, deployerAddress: string}, client: StreamrClient) {
        const contracts = new Contracts(client)
        const contractAddress = contracts.getDataUnionMainnetAddress(dataUnionName, getAddress(deployerAddress)) // throws if bad address
        return DataUnion._fromContractAddress(contractAddress, client) // eslint-disable-line no-underscore-dangle
    }

    /** @internal */
    async _getContract() {
        const ret = this.getContracts().getMainnetContract(this.contractAddress)
        // @ts-expect-error
        ret.sidechain = await this.getContracts().getSidechainContract(this.contractAddress)
        return ret
    }

    private getContracts() {
        return new Contracts(this.client)
    }

    /**
     * Template for withdraw functions
     * @private
     * @returns the sidechain withdraw transaction receipt IF called with sendToMainnet=false,
     *          ELSE the message hash IF called with payForTransport=false and waitUntilTransportIsComplete=false,
     *          ELSE the mainnet AMB signature execution transaction receipt IF we did the transport ourselves,
     *          ELSE null IF transport to mainnet was done by someone else (in which case the receipt is lost)
     */
    private async _executeWithdraw(
        getWithdrawTxFunc: () => Promise<ContractTransaction>,
        recipientAddress: EthereumAddress,
        options: DataUnionWithdrawOptions = {}
    ): Promise<ContractReceipt | AmbMessageHash | null> {
        const {
            pollingIntervalMs = 1000,
            retryTimeoutMs = 300000,
            // by default, transport the signatures if payForTransport=false isn't supported by the sidechain
            payForTransport = this.client.options.dataUnion.payForTransport,
            waitUntilTransportIsComplete = true,
            sendToMainnet = true,
        } = options

        const getBalanceFunc = sendToMainnet
            ? () => this.client.getTokenBalance(recipientAddress)
            : () => this.client.getSidechainTokenBalance(recipientAddress)
        const balanceBefore = waitUntilTransportIsComplete ? await getBalanceFunc() : 0

        log('Executing DataUnionSidechain withdraw function')
        const tx = await getWithdrawTxFunc()
        const tr = await waitForTx(tx)

        // keep tokens in the sidechain => just return the sidechain tx receipt
        if (!sendToMainnet) { return tr }

        log(`Got receipt, filtering UserRequestForSignature from ${tr.events!.length} events...`)
        const ambHashes = getMessageHashes(tr)

        if (ambHashes.length < 1) {
            throw new Error("No UserRequestForSignature events emitted from withdraw transaction, can't transport withdraw to mainnet")
        }

        if (ambHashes.length > 1) {
            throw new Error('Expected only one UserRequestForSignature event')
        }

        const messageHash = ambHashes[0]

        // expect someone else to do the transport for us
        if (!payForTransport) {
            if (waitUntilTransportIsComplete) {
                log(`Waiting for balance=${balanceBefore.toString()} change (poll every ${pollingIntervalMs}ms, timeout after ${retryTimeoutMs}ms)`)
                await until(async () => !(await getBalanceFunc()).eq(balanceBefore), retryTimeoutMs, pollingIntervalMs).catch((e) => {
                    const msg = `Timeout: Bridge did not transport withdraw message as expected. Fix: DataUnion.transportMessage("${messageHash}")`
                    throw e.message.startsWith('Timeout') ? new Error(msg) : e
                })
                return null
            }

            // instead of waiting, hand out the messageHash so that we can pass it on to that who does the transportMessage(messageHash)
            return messageHash
        }

        const ambTr = await this.transportMessage(messageHash, pollingIntervalMs, retryTimeoutMs)
        if (waitUntilTransportIsComplete) {
            log(`Waiting for balance ${balanceBefore.toString()} to change`)
            await until(async () => !(await getBalanceFunc()).eq(balanceBefore), retryTimeoutMs, pollingIntervalMs)
        }
        return ambTr
    }

    // TODO: this doesn't belong here. Transporting a message is NOT dataunion-specific and needs nothing from DataUnion.ts.
    //       It shouldn't be required to create a DataUnion object to call this.
    //       This belongs to the StreamrClient, and if the code is too DU-specific then please shove it back to Contracts.ts.
    //       Division to transportMessage and Contracts.transportSignaturesForMessage is spurious, they should be one long function probably.
    /**
     * @returns null if message was already transported, ELSE the mainnet AMB signature execution transaction receipt
     */
    async transportMessage(messageHash: AmbMessageHash, pollingIntervalMs: number = 1000, retryTimeoutMs: number = 300000) {
        const helper = this.getContracts()
        const [sidechainAmb, mainnetAmb] = await Promise.all([
            helper.getSidechainAmb(),
            helper.getMainnetAmb(),
        ])

        log(`Waiting until sidechain AMB has collected required signatures for hash=${messageHash}...`)
        await until(async () => helper.requiredSignaturesHaveBeenCollected(messageHash), retryTimeoutMs, pollingIntervalMs)

        const message = await sidechainAmb.message(messageHash)
        if (message === '0x') {
            throw new Error(`Message with hash=${messageHash} not found`)
        }
        const messageId = '0x' + message.substr(2, 64)

        log(`Checking mainnet AMB hasn't already processed messageId=${messageId}`)
        const [alreadySent, failAddress] = await Promise.all([
            mainnetAmb.messageCallStatus(messageId),
            mainnetAmb.failedMessageSender(messageId),
        ])

        // zero address means no failed messages
        if (alreadySent || failAddress !== '0x0000000000000000000000000000000000000000') {
            log(`WARNING: Tried to transport signatures but they have already been transported (Message ${messageId} has already been processed)`)
            log('This could happen if bridge paid for transport before your client.')
            return null
        }

        log(`Transporting signatures for hash=${messageHash}`)
        return helper.transportSignaturesForMessage(messageHash)
    }
}
