import type { LitNodeClient } from '@lit-protocol/lit-node-client'
import { Logger, StreamID, randomString, binaryToHex } from '@streamr/utils'
import { Lifecycle, inject, scoped } from 'tsyringe'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { StreamPermission, streamPermissionToSolidityType } from '../permission'
import { LoggerFactory } from '../utils/LoggerFactory'
import { GroupKey } from './GroupKey'
import { ethers } from 'ethers'
import { SiweMessage } from 'lit-siwe'

const logger = new Logger(module)

const chain = 'polygon'

const GROUP_KEY_ID_SEPARATOR = '::'

// TODO: can this type be imported directly from '@lit-protocol/lit-node-client'?
type ContractConditions = Parameters<LitNodeClient['encrypt']>[0]['evmContractConditions']

export const formEvmContractConditions = (
    streamRegistryChainAddress: string,
    streamId: StreamID
): ContractConditions => ([
    {
        contractAddress: streamRegistryChainAddress,
        chain,
        functionName: 'hasPermission',
        functionParams: [streamId, ':userAddress', `${streamPermissionToSolidityType(StreamPermission.SUBSCRIBE)}`],
        functionAbi: {
            inputs: [
                {
                    name: 'streamId',
                    type: 'string'
                },
                {
                    name: 'user',
                    type: 'address'
                },
                {
                    name: 'permissionType',
                    type: 'uint8'
                }
            ],
            name: 'hasPermission',
            outputs: [
                {
                    name: 'userHasPermission',
                    type: 'bool'
                }
            ],
            stateMutability: 'view',
            type: 'function'
        },
        returnValueTest: {
            key: 'userHasPermission',
            comparator: '=',
            value: 'true',
        },
    }
])

const signAuthMessage = async (litNodeClient: LitNodeClient, authentication: Authentication) => {
    const domain = 'localhost'
    const uri = 'https://localhost/login'
    const statement = 'dummy'
    const addressInChecksumCase = ethers.getAddress(await authentication.getAddress())
    const nonce = await litNodeClient.getLatestBlockhash()
    const expirationTime = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString()
    const siweMessage = new SiweMessage({
        domain,
        uri,
        statement,
        address: addressInChecksumCase,
        version: '1',
        chainId: 1,
        expirationTime,
        nonce
    })
    const messageToSign = siweMessage.prepareMessage()
    const signature = await authentication.createMessageSignature(Buffer.from(messageToSign))
    return {
        sig: binaryToHex(signature, true),
        derivedVia: 'web3.eth.personal.sign',
        signedMessage: messageToSign,
        address: addressInChecksumCase
    }
}

function splitGroupKeyId(groupKeyId: string): { ciphertext: string, dataToEncryptHash: string } | undefined {
    const [ciphertext, dataToEncryptHash] = groupKeyId.split(GROUP_KEY_ID_SEPARATOR)
    if (ciphertext !== undefined && dataToEncryptHash !== undefined) {
        return { ciphertext, dataToEncryptHash }
    }
    return undefined
}

/**
 * This class only operates with Polygon production network and therefore ignores contracts config.
 */
@scoped(Lifecycle.ContainerScoped)
export class LitProtocolFacade {

    private readonly config: Pick<StrictStreamrClientConfig, 'contracts'>
    private readonly authentication: Authentication
    private readonly logger: Logger
    private litNodeClient?: LitNodeClient

    /* eslint-disable indent */
    constructor(
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'contracts'>,
        @inject(AuthenticationInjectionToken) authentication: Authentication,
        loggerFactory: LoggerFactory
    ) {
        this.config = config
        this.authentication = authentication
        this.logger = loggerFactory.createLogger(module)
    }

    setLitNodeClient(litNodeClient: LitNodeClient): void {
        this.litNodeClient = litNodeClient
    }

    isLitProtocolEnabled(): boolean {
        return this.litNodeClient !== undefined
    }

    async store(streamId: StreamID, symmetricKey: Uint8Array): Promise<GroupKey | undefined> {
        if (this.litNodeClient === undefined) {
            return undefined
        }
        const traceId = randomString(5)
        this.logger.debug('Storing key', { streamId, traceId })
        try {
            await this.litNodeClient.connect()
            const { ciphertext, dataToEncryptHash } = await this.litNodeClient.encrypt({
                evmContractConditions: formEvmContractConditions(this.config.contracts.streamRegistryChainAddress, streamId),
                dataToEncrypt: symmetricKey
            })
            const groupKeyId = ciphertext + GROUP_KEY_ID_SEPARATOR + dataToEncryptHash
            this.logger.debug('Stored key', { traceId, streamId, groupKeyId })
            return new GroupKey(groupKeyId, Buffer.from(symmetricKey))
        } catch (err) {
            logger.warn('Failed to store key', { traceId, err, streamId })
            return undefined
        }
    }

    async get(streamId: StreamID, groupKeyId: string): Promise<GroupKey | undefined> {
        if (this.litNodeClient === undefined) {
            return undefined
        }
        this.logger.debug('Getting key', { groupKeyId, streamId })
        try {
            const splitResult = splitGroupKeyId(groupKeyId)
            if (splitResult === undefined) {
                return undefined
            }
            await this.litNodeClient.connect()
            const authSig = await signAuthMessage(this.litNodeClient, this.authentication)
            const decryptResponse = await this.litNodeClient.decrypt({
                evmContractConditions: formEvmContractConditions(this.config.contracts.streamRegistryChainAddress, streamId),
                ciphertext: splitResult.ciphertext,
                dataToEncryptHash: splitResult.dataToEncryptHash,
                chain,
                authSig
            })
            this.logger.debug('Got key', { groupKeyId, streamId })
            return new GroupKey(groupKeyId, Buffer.from(decryptResponse.decryptedData))
        } catch (err) {
            logger.warn('Failed to get key', { err, streamId, groupKeyId })
            return undefined
        }
    }
}
