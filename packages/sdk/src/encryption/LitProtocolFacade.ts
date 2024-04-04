import { LitNodeClient } from '@lit-protocol/lit-node-client'
import { binaryToHex, Logger, StreamID, randomString } from '@streamr/utils'
import { ethers } from 'ethers'
import * as siwe from 'lit-siwe'
import { Lifecycle, inject, scoped } from 'tsyringe'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { StreamPermission, streamPermissionToSolidityType } from '../permission'
import { LoggerFactory } from '../utils/LoggerFactory'
import { GroupKey } from './GroupKey'

const logger = new Logger(module)

const chain = 'polygon'

const GROUP_KEY_ID_SEPARATOR = '::'

const formEvmContractConditions = (streamRegistryChainAddress: string, streamId: StreamID) => ([
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
    const nonce = litNodeClient.getLatestBlockhash()
    const expirationTime = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString()
    const siweMessage = new siwe.SiweMessage({
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

    private litNodeClient?: LitNodeClient
    private readonly config: Pick<StrictStreamrClientConfig, 'contracts' | 'encryption'>
    private readonly authentication: Authentication
    private readonly logger: Logger

    /* eslint-disable indent */
    constructor(
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'contracts' | 'encryption'>,
        @inject(AuthenticationInjectionToken) authentication: Authentication,
        loggerFactory: LoggerFactory
    ) {
        this.config = config
        this.authentication = authentication
        this.logger = loggerFactory.createLogger(module)
    }

    async getLitNodeClient(): Promise<LitNodeClient> {
        if (this.litNodeClient === undefined) {
            this.litNodeClient = new LitNodeClient({
                alertWhenUnauthorized: false,
                debug: this.config.encryption.litProtocolLogging
            })
            await this.litNodeClient.connect()
        }
        return this.litNodeClient
    }

    async store(streamId: StreamID, symmetricKey: Uint8Array): Promise<GroupKey | undefined> {
        const traceId = randomString(5)
        this.logger.debug('Storing key', { streamId, traceId })
        try {
            const client = await this.getLitNodeClient()
            const authSig = await signAuthMessage(client, this.authentication)
            const { ciphertext, dataToEncryptHash } = await client.encrypt({
                evmContractConditions: formEvmContractConditions(this.config.contracts.streamRegistryChainAddress, streamId),
                dataToEncrypt: symmetricKey,
                authSig,
                chain
            })
            if (ciphertext === undefined || dataToEncryptHash === undefined) {
                return undefined
            }
            const groupKeyId = ciphertext + GROUP_KEY_ID_SEPARATOR + dataToEncryptHash
            this.logger.debug('Stored key', { traceId, streamId, groupKeyId })
            return new GroupKey(groupKeyId, Buffer.from(symmetricKey))
        } catch (err) {
            logger.warn('Failed to store key', { traceId, err, streamId })
            return undefined
        }
    }

    async get(streamId: StreamID, groupKeyId: string): Promise<GroupKey | undefined> {
        this.logger.debug('Getting key', { groupKeyId, streamId })
        try {
            const splitResult = splitGroupKeyId(groupKeyId)
            if (splitResult === undefined) {
                return undefined
            }
            const client = await this.getLitNodeClient()
            const authSig = await signAuthMessage(client, this.authentication)
            const decryptResponse = await client.decrypt({
                evmContractConditions: formEvmContractConditions(this.config.contracts.streamRegistryChainAddress, streamId),
                ciphertext: splitResult.ciphertext,
                dataToEncryptHash: splitResult.dataToEncryptHash,
                chain,
                authSig
            })
            if (decryptResponse?.decryptedData === undefined) {
                return undefined
            }
            this.logger.debug('Got key', { groupKeyId, streamId })
            return new GroupKey(groupKeyId, Buffer.from(decryptResponse.decryptedData))
        } catch (err) {
            logger.warn('Failed to get key', { err, streamId, groupKeyId })
            return undefined
        }
    }
}
