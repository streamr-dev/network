import { merge, omit } from 'lodash'
import { BrubeckClientConfig, StreamrClient, ConfigTest } from 'streamr-client'
import { GlobalCommandLineArgs } from './common'
import { getConfig } from './config'

const getClientConfig = (commandLineArgs: GlobalCommandLineArgs, overridenOptions: BrubeckClientConfig) => {
    const environmentOptions = (commandLineArgs.dev !== undefined) ? omit(ConfigTest, 'auth') : undefined
    const configFileJson = getConfig(commandLineArgs.config)?.client
    const authenticationOptions = (commandLineArgs.privateKey !== undefined) ? { auth: { privateKey: commandLineArgs.privateKey } } : undefined
    return merge(
        environmentOptions,
        configFileJson,
        authenticationOptions,
        overridenOptions
    )
}

const addInterruptHandler = (client: StreamrClient) => {
    process.on('SIGINT', async () => {
        try {
            await client.destroy()
        } catch {}
        process.exit()
    })
}

export const createClient = (commandLineArgs: GlobalCommandLineArgs, overridenOptions: BrubeckClientConfig = {}): StreamrClient => {
    const config = getClientConfig(commandLineArgs, overridenOptions)
    const client = new StreamrClient(config)
    addInterruptHandler(client)
    return client
}