import * as LitJsSdk from '@lit-protocol/lit-node-client'
import { inject, Lifecycle, scoped } from 'tsyringe'
import * as siwe from 'lit-siwe'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { ethers } from 'ethers'
import { StreamID } from '@streamr/protocol'
import { StreamPermission, streamPermissionToSolidityType } from '../permission'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { GroupKey } from './GroupKey'
import { Logger } from '@streamr/utils'
import { LoggerFactory } from '../utils/LoggerFactory'

const logger = new Logger(module)

const chain = 'polygon'

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
    const domain = "localhost"
    const uri = "https://localhost/login"
    const statement = "This is a test statement. You can put anything you want here."
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
    private readonly logger: Logger
    private litNodeClient?: LitJsSdk.LitNodeClient

    constructor(
        @inject(AuthenticationInjectionToken) private readonly authentication: Authentication,
        @inject(ConfigInjectionToken) private readonly config: Pick<StrictStreamrClientConfig, 'contracts' | 'encryption'>,
        private readonly loggerFactory: LoggerFactory
    ) {
        this.logger = this.loggerFactory.createLogger(module)
    }

    getLitNodeClient(): LitJsSdk.LitNodeClient {
        if (this.litNodeClient === undefined) {
            this.litNodeClient = new LitJsSdk.LitNodeClient({
                alertWhenUnauthorized: false,
                debug: this.config.encryption.litProtocolLogging
            })
        }
        return this.litNodeClient
    }

    async store(streamId: StreamID, symmetricKey: Uint8Array): Promise<GroupKey | undefined> {
        this.logger.debug('storing key: %j', { streamId })
        try {
            await this.getLitNodeClient().connect()
            const authSig = await signAuthMessage(this.authentication)
            const encryptedSymmetricKey = await this.getLitNodeClient().saveEncryptionKey({
                evmContractConditions: formEvmContractConditions(this.config.contracts.streamRegistryChainAddress, streamId),
                symmetricKey,
                authSig,
                chain
            })
            if (encryptedSymmetricKey === undefined) {
                return undefined
            }
            const groupKeyId = LitJsSdk.uint8arrayToString(encryptedSymmetricKey, 'base16')
            this.logger.debug('stored key: %j', { groupKeyId, streamId })
            return new GroupKey(groupKeyId, Buffer.from(symmetricKey))
        } catch (e) {
            logger.warn('encountered error when trying to store key on lit-protocol: %s', e)
            return undefined
        }
    }

    async get(streamId: StreamID, groupKeyId: string): Promise<GroupKey | undefined> {
        this.logger.debug('get key: %j', { groupKeyId, streamId })
        try {
            await this.getLitNodeClient().connect()
            const authSig = await signAuthMessage(this.authentication)
            const symmetricKey = await this.getLitNodeClient().getEncryptionKey({
                evmContractConditions: formEvmContractConditions(this.config.contracts.streamRegistryChainAddress, streamId),
                toDecrypt: groupKeyId,
                chain,
                authSig
            })
            if (symmetricKey === undefined) {
                return undefined
            }
            this.logger.debug('got key: %j', { groupKeyId, streamId })
            return new GroupKey(groupKeyId, Buffer.from(symmetricKey))
        } catch (e) {
            logger.warn('encountered error when trying to get key from lit-protocol: %s', e)
            return undefined
        }
    }
}
