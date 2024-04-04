import { LitNodeClient } from '@lit-protocol/lit-node-client'
import { StreamID } from '@streamr/protocol'
import { Logger, randomString, withRateLimit } from '@streamr/utils'
import { ethers } from 'ethers'
import * as siwe from 'lit-siwe'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { StreamPermission, streamPermissionToSolidityType } from '../permission'
import { LoggerFactory } from '../utils/LoggerFactory'
import { GroupKey } from './GroupKey'

const logger = new Logger(module)

const chain = 'polygon'

const LIT_PROTOCOL_CONNECT_INTERVAL = 60 * 60 * 1000 // 1h

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

const signAuthMessage = async (authentication: Authentication) => {
    const domain = 'dummy.com'
    const uri = 'https://dummy.com'
    const statement = 'dummy'
    const addressInChecksumCase = ethers.utils.getAddress(await authentication.getAddress())
    const siweMessage = new siwe.SiweMessage({
        domain,
        uri,
        statement,
        address: addressInChecksumCase,
        version: '1',
        chainId: 1
    })
    const messageToSign = siweMessage.prepareMessage()
    const signature = await authentication.createMessageSignature(Buffer.from(messageToSign))
    return {
        sig: signature,
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
            const authSig = await signAuthMessage(this.authentication)
            const client = await this.getLitNodeClient()
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
            const authSig = await signAuthMessage(this.authentication)
            const client = await this.getLitNodeClient()
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
