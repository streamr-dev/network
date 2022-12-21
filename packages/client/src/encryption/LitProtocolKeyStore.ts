import * as LitJsSdk from '@lit-protocol/lit-node-client'
import { inject, Lifecycle, scoped } from 'tsyringe'
import * as siwe from 'siwe'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { ethers } from 'ethers'
import { Logger } from '@streamr/utils'
import { StreamID } from '@streamr/protocol'

const logger = new Logger(module)

const formEvmContractConditions = (streamId: StreamID) => ([
    {
        contractAddress: '0x0D483E10612F327FC11965Fc82E90dC19b141641',
        chain: 'polygon',
        functionName: 'hasPermission',
        functionParams: [streamId, ':userAddress', '2'],
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
    const address = ethers.utils.getAddress(await authentication.getAddress())
    const siweMessage = new siwe.SiweMessage({
        domain,
        uri,
        statement,
        address,
        version: "1",
        chainId: 1
    })
    const messageToSign = siweMessage.prepareMessage()
    const signature = await authentication.createMessageSignature(messageToSign)
    return {
        sig: signature,
        derivedVia: "web3.eth.personal.sign",
        signedMessage: messageToSign,
        address
    }
}

const chain = 'polygon'

@scoped(Lifecycle.ContainerScoped)
export class LitProtocolKeyStore {
    private readonly litNodeClient = new LitJsSdk.LitNodeClient({
        alertWhenUnauthorized: false,
        debug: true
    })

    constructor(
        @inject(AuthenticationInjectionToken) private readonly authentication: Authentication
    ) {}

    async store(streamId: StreamID, symmetricKey: Uint8Array): Promise<void> {
        await this.litNodeClient.connect()
        const authSig = await signAuthMessage(this.authentication)
        await this.litNodeClient.saveEncryptionKey({
            evmContractConditions: formEvmContractConditions(streamId),
            symmetricKey,
            authSig,
            chain
        })
    }

    async get(streamId: StreamID, encryptedSymmetricKey: Uint8Array): Promise<Uint8Array | undefined> {
        await this.litNodeClient.connect()
        const authSig = await signAuthMessage(this.authentication)
        const toDecrypt = LitJsSdk.uint8arrayToString(encryptedSymmetricKey, 'base16')

        // 3. Decrypt it
        return this.litNodeClient.getEncryptionKey({
            evmContractConditions: formEvmContractConditions(streamId),
            toDecrypt,
            chain,
            authSig
        })
    }
}
