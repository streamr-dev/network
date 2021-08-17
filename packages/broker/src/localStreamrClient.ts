import { StreamrClient } from 'streamr-client'
import { Config } from './config'

// Plugins can communicate with this node via StreamrClient if WS plugin is enabled
// This is a temporary solution to prototype Brubeck-plugins

export const createLocalStreamrClient = (config: Config): StreamrClient|undefined => {
    return new StreamrClient({
        auth:{
            privateKey: config.ethereumPrivateKey
        },
        restUrl: `${config.streamrUrl}/api/v1`,
        autoDisconnect: false
    })
}
