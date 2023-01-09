import { StreamrClientConfig } from 'streamr-client'
import path from 'path'
import * as os from 'os'
import { Logger } from '@streamr/utils'

const logger = new Logger(module)

export interface Config {
    client: StreamrClientConfig
    httpServer?: {
        port: number
        sslCertificate?: {
            privateKeyFileName: string
            certFileName: string
        }
    }
    apiAuthentication?: {
        keys: string[]
    }
    plugins: Record<string, any>
}

export interface ConfigFile extends Config {
    $schema?: string
}

export interface ConfigFile extends Config {
    $schema?: string
}

export const getDefaultFile = (): string => {
    const relativePath = '.streamr/config/default.json'
    return path.join(os.homedir(), relativePath)
}

export const getLegacyDefaultFile = (): string => {
    const relativePath = '/.streamr/broker-config.json'
    return path.join(os.homedir(), relativePath)
}

// See NET-934, this exists for compatibility with a specific vendor's use case
export function overrideConfigToEnvVarsIfGiven(config: Pick<Config, 'client' | 'plugins'>): void {
    const ENV_VAR_PRIVATE_KEY: string | undefined = process.env.OVERRIDE_BROKER_PRIVATE_KEY
    const ENV_VAR_BENEFICIARY_ADDRESS: string | undefined = process.env.OVERRIDE_BROKER_BENEFICIARY_ADDRESS

    if (ENV_VAR_PRIVATE_KEY !== undefined) {
        if (config.client.auth !== undefined && 'privateKey' in config.client.auth) {
            logger.info('overriding private key to OVERRIDE_BROKER_PRIVATE_KEY')
            config.client.auth.privateKey = ENV_VAR_PRIVATE_KEY
        } else {
            logger.warn('ignoring OVERRIDE_BROKER_PRIVATE_KEY due to not using private key authentication')
        }
    }
    if (ENV_VAR_BENEFICIARY_ADDRESS !== undefined) {
        if ('brubeckMiner' in config.plugins) {
            logger.info('overriding beneficiary address to OVERRIDE_BROKER_BENEFICIARY_ADDRESS')
            config.plugins.brubeckMiner.beneficiaryAddress = ENV_VAR_BENEFICIARY_ADDRESS
        } else {
            logger.warn('ignoring OVERRIDE_BROKER_BENEFICIARY_ADDRESS due to miner plugin not being enabled')
        }
    }
}
