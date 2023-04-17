import * as LitJsSdk from '@lit-protocol/lit-node-client'
import { inject, Lifecycle, scoped } from 'tsyringe'
import * as siwe from 'lit-siwe'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { ethers } from 'ethers'
import { StreamID } from '@streamr/protocol'
import { StreamPermission, streamPermissionToSolidityType } from '../permission'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { GroupKey } from './GroupKey'
import { Logger, randomString, withRateLimit } from '@streamr/utils'
import { LoggerFactory } from '../utils/LoggerFactory'

const logger = new Logger(module)

const chain = 'polygon'

const LIT_PROTOCOL_CONNECT_INTERVAL = 60 * 60 * 1000 // 1h

const formEvmContractConditions = (streamRegistryChainAddress: string, streamId: StreamID) => ([
    {
        contractAddress: streamRegistryChainAddress,
        chain,
        functionName: 'hasPermission',
        functionParams: [streamId, ':userAddress', `${streamPermissionToSolidityType(StreamPermission.SUBSCRIBE)}`],
        functionAbi: {
            inputs: [
                {
                    name: "streamId",
                    type: "string"
                },
                {
                    name: "user",
                    type: "address"
                },
                {
                    name: "permissionType",
                    type: "uint8"
                }
            ],
            name: "hasPermission",
            outputs: [
                {
                    name: "userHasPermission",
                    type: "bool"
                }
            ],
            stateMutability: "view",
            type: "function"
        },
        returnValueTest: {
            key: "userHasPermission",
            comparator: '=',
            value: "true",
        },
    }
])

const signAuthMessage = async (authentication: Authentication) => {
    const domain = "dummy.com"
    const uri = "https://dummy.com"
    const statement = "dummy"
    const addressInChecksumCase = ethers.utils.getAddress(await authentication.getAddress())
    const siweMessage = new siwe.SiweMessage({
        domain,
        uri,
        statement,
        address: addressInChecksumCase,
        version: "1",
        chainId: 1
    })
    const messageToSign = siweMessage.prepareMessage()
    const signature = await authentication.createMessageSignature(messageToSign)
    return {
        sig: signature,
        derivedVia: "web3.eth.personal.sign",
        signedMessage: messageToSign,
        address: addressInChecksumCase
    }
}

/**
 * This class only operates with Polygon production network and therefore ignores contracts config.
 */
@scoped(Lifecycle.ContainerScoped)
export class LitProtocolFacade {
    private readonly authentication: Authentication
    private readonly config: Pick<StrictStreamrClientConfig, 'contracts' | 'encryption'>
    private readonly logger: Logger
    private litNodeClient?: LitJsSdk.LitNodeClient
    private connectLitNodeClient?: () => Promise<void>

    constructor(
        loggerFactory: LoggerFactory,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'contracts' | 'encryption'>,
        @inject(AuthenticationInjectionToken) authentication: Authentication,
    ) {
        this.authentication = authentication
        this.config = config
        this.logger = loggerFactory.createLogger(module)
    }

    async getLitNodeClient(): Promise<LitJsSdk.LitNodeClient> {
        if (this.litNodeClient === undefined) {
            this.litNodeClient = new LitJsSdk.LitNodeClient({
                alertWhenUnauthorized: false,
                debug: this.config.encryption.litProtocolLogging
            })
            // Add a rate limiter to avoid calling `connect` each time we want to use lit protocol as this would cause an unnecessary handshake.
            this.connectLitNodeClient = withRateLimit(() => this.litNodeClient!.connect(), LIT_PROTOCOL_CONNECT_INTERVAL)
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
                evmContractConditions: formEvmContractConditions(this.config.contracts.streamRegistryChainAddress, streamId),
                symmetricKey,
                authSig,
                chain
            })
            if (encryptedSymmetricKey === undefined) {
                return undefined
            }
            const groupKeyId = LitJsSdk.uint8arrayToString(encryptedSymmetricKey, 'base16')
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
                evmContractConditions: formEvmContractConditions(this.config.contracts.streamRegistryChainAddress, streamId),
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
