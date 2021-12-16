import _ from 'lodash'
import { BrubeckClientConfig, StreamrClient, ConfigTest } from 'streamr-client'
import { GlobalCommandLineArgs } from './common'
import { getConfig } from './config'

const getClientConfig = (commandLineArgs: GlobalCommandLineArgs, overridenOptions: BrubeckClientConfig) => {
    const environmentOptions = (commandLineArgs.dev !== undefined) ? _.omit(ConfigTest, 'auth') : undefined
    const configFileJson = getConfig(commandLineArgs.config)?.client
    const authenticationOptions = (commandLineArgs.privateKey !== undefined) ? { auth: { privateKey: commandLineArgs.privateKey } } : undefined
    return _.merge(
        environmentOptions,
        configFileJson,
        authenticationOptions,
        overridenOptions
    )
}

export const createClient = (commandLineArgs: GlobalCommandLineArgs, overridenOptions: BrubeckClientConfig = {}): StreamrClient => {
    const config = getClientConfig(commandLineArgs, overridenOptions)
    return new StreamrClient(config)
}