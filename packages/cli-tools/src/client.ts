import { type KeyPairIdentityConfig, StreamrClient, type StreamrClientConfig } from '@streamr/sdk'
import merge from 'lodash/merge'
import { Options } from './command'
import { getConfig } from './config'

export const getClientConfig = (commandOptions: Options, overridenOptions: StreamrClientConfig = {}): StreamrClientConfig => {
    const configFileJson = getConfig(commandOptions.config)?.client
    const environmentOptions: StreamrClientConfig = { environment: commandOptions.env }

    const keyPairConfig: KeyPairIdentityConfig | undefined = 
        (commandOptions.privateKey) ? { 
            privateKey: commandOptions.privateKey,
            publicKey: commandOptions.publicKey,
            keyType: commandOptions.keyType
        } : undefined

    const encryptionOptions: StreamrClientConfig = 
        (commandOptions.quantum === true) ? { 
            encryption: { 
                requireQuantumResistantKeyExchange: true,
                requireQuantumResistantSignatures: true,
            } 
        } : {}
    return merge(
        configFileJson,
        environmentOptions,
        keyPairConfig ? { auth: keyPairConfig } : {},
        encryptionOptions,
        overridenOptions
    )
}

const addInterruptHandler = (client: StreamrClient) => {
    process.on('SIGINT', async () => {
        try {
            await client.destroy()
        } catch {
            // no-op
        }
        process.exit()
    })
}

export const createClient = (commandOptions: Options, overridenOptions: StreamrClientConfig = {}): StreamrClient => {
    const config = getClientConfig(commandOptions, overridenOptions)
    const client = new StreamrClient(config)
    addInterruptHandler(client)
    return client
}
