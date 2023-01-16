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
export class LitProtocolKeyStore {
    private readonly litNodeClient: LitJsSdk.LitNodeClient | undefined

    constructor(
        @inject(AuthenticationInjectionToken) private readonly authentication: Authentication,
        @inject(ConfigInjectionToken) private readonly config: Pick<StrictStreamrClientConfig, 'contracts' | 'litProtocolEnabled'>
    ) {
        if (config.litProtocolEnabled) {
            logger.debug('lit-protocol enabled')
            this.litNodeClient = new LitJsSdk.LitNodeClient({
                alertWhenUnauthorized: false,
                debug: true
            })
        } else {
            logger.debug('lit-protocol disabled')
            this.litNodeClient = undefined
        }
    }

    async store(streamId: StreamID, symmetricKey: Uint8Array): Promise<GroupKey | undefined> {
        if (this.litNodeClient === undefined) {
            return undefined
        }
        try {
            await this.litNodeClient.connect()
            const authSig = await signAuthMessage(this.authentication)
            const encryptedSymmetricKey = await this.litNodeClient.saveEncryptionKey({
                evmContractConditions: formEvmContractConditions(this.config.contracts.streamRegistryChainAddress, streamId),
                symmetricKey,
                authSig,
                chain
            })
            if (encryptedSymmetricKey === undefined) {
                return undefined
            }
            const groupKeyId = LitJsSdk.uint8arrayToString(encryptedSymmetricKey, 'base16')
            return new GroupKey(groupKeyId, Buffer.from(symmetricKey))
        } catch (e) {
            logger.warn('encountered error when trying to store key on lit-protocol: %s', e)
            return undefined
        }
    }

    async get(streamId: StreamID, encryptedSymmetricKey: string): Promise<GroupKey | undefined> {
        if (this.litNodeClient === undefined) {
            return undefined
        }
        try {
            await this.litNodeClient.connect()
            const authSig = await signAuthMessage(this.authentication)
            const symmetricKey = await this.litNodeClient.getEncryptionKey({
                evmContractConditions: formEvmContractConditions(this.config.contracts.streamRegistryChainAddress, streamId),
                toDecrypt: encryptedSymmetricKey,
                chain,
                authSig
            })
            if (symmetricKey === undefined) {
                return undefined
            }
            return new GroupKey(encryptedSymmetricKey, Buffer.from(symmetricKey))
        } catch (e) {
            logger.warn('encountered error when trying to get key from lit-protocol: %s', e)
            return undefined
        }
    }
}
