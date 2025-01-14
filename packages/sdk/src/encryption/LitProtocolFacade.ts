import { LitCore } from '@lit-protocol/core'
import { uint8arrayToString } from '@lit-protocol/uint8arrays'
import { Logger, StreamID, randomString, withRateLimit, toEthereumAddress } from '@streamr/utils'
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

const LIT_PROTOCOL_CONNECT_INTERVAL = 60 * 60 * 1000 // 1h

const formEvmContractConditions = (streamRegistryChainAddress: string, streamId: StreamID) => [
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
            value: 'true'
        }
    }
]

const signAuthMessage = async (authentication: Authentication) => {
    const domain = 'dummy.com'
    const uri = 'https://dummy.com'
    const statement = 'dummy'
    const addressInChecksumCase = ethers.getAddress(toEthereumAddress(await authentication.getUserId()))
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

/**
 * This class only operates with Polygon production network and therefore ignores contracts config.
 */
@scoped(Lifecycle.ContainerScoped)
export class LitProtocolFacade {
    private litNodeClient?: LitCore
    private readonly config: Pick<StrictStreamrClientConfig, 'contracts' | 'encryption'>
    private readonly authentication: Authentication
    private readonly logger: Logger
    private connectLitNodeClient?: () => Promise<void>

    constructor(
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'contracts' | 'encryption'>,
        @inject(AuthenticationInjectionToken) authentication: Authentication,
        loggerFactory: LoggerFactory
    ) {
        this.config = config
        this.authentication = authentication
        this.logger = loggerFactory.createLogger(module)
    }

    async getLitNodeClient(): Promise<LitCore> {
        if (this.litNodeClient === undefined) {
            this.litNodeClient = new LitCore({
                alertWhenUnauthorized: false,
                debug: this.config.encryption.litProtocolLogging
            })
            // Add a rate limiter to avoid calling `connect` each time we want to use lit protocol as this would cause an unnecessary handshake.
            this.connectLitNodeClient = withRateLimit(
                () => this.litNodeClient!.connect(),
                LIT_PROTOCOL_CONNECT_INTERVAL
            )
        }
        await this.connectLitNodeClient!()
        return this.litNodeClient
    }

    async store(streamId: StreamID, symmetricKey: Uint8Array): Promise<GroupKey | undefined> {
        const traceId = randomString(5)
        this.logger.debug('Storing key', { streamId, traceId })
        try {
            const authSig = await signAuthMessage(this.authentication)
            const client = await this.getLitNodeClient()
            const encryptedSymmetricKey = await client.saveEncryptionKey({
                evmContractConditions: formEvmContractConditions(
                    this.config.contracts.streamRegistryChainAddress,
                    streamId
                ),
                symmetricKey,
                authSig,
                chain
            })
            if (encryptedSymmetricKey === undefined) {
                return undefined
            }
            const groupKeyId = uint8arrayToString(encryptedSymmetricKey, 'base16')
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
            const authSig = await signAuthMessage(this.authentication)
            const client = await this.getLitNodeClient()
            const symmetricKey = await client.getEncryptionKey({
                evmContractConditions: formEvmContractConditions(
                    this.config.contracts.streamRegistryChainAddress,
                    streamId
                ),
                toDecrypt: groupKeyId,
                chain,
                authSig
            })
            if (symmetricKey === undefined) {
                return undefined
            }
            this.logger.debug('Got key', { groupKeyId, streamId })
            return new GroupKey(groupKeyId, Buffer.from(symmetricKey))
        } catch (err) {
            logger.warn('Failed to get key', { err, streamId, groupKeyId })
            return undefined
        }
    }
}
