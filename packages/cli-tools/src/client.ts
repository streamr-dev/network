import { BrubeckClientConfig, StreamrClient } from 'streamr-client'
import { formStreamrOptionsWithEnv, GlobalCommandLineOptions } from '../bin/common'

export const createClient = (commandLineOptions: GlobalCommandLineOptions, overridenOpts: BrubeckClientConfig = {}): StreamrClient => {
    return new StreamrClient({
        ...formStreamrOptionsWithEnv(commandLineOptions),
        ...overridenOpts
    })
}