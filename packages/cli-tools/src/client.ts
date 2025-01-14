import { StreamrClient, StreamrClientConfig } from '@streamr/sdk'
import merge from 'lodash/merge'
import { Options } from './command'
import { getConfig } from './config'

export const getClientConfig = (
    commandOptions: Options,
    overridenOptions: StreamrClientConfig = {}
): StreamrClientConfig => {
    const configFileJson = getConfig(commandOptions.config)?.client
    const environmentOptions = { environment: commandOptions.env }
    const authenticationOptions =
        commandOptions.privateKey !== undefined ? { auth: { privateKey: commandOptions.privateKey } } : undefined
    return merge(configFileJson, environmentOptions, authenticationOptions, overridenOptions)
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
