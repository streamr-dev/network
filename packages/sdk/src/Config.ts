import cloneDeep from 'lodash/cloneDeep'
import { merge } from '@streamr/utils'
import { generateClientId } from './utils/utils'
import validate from './generated/validateConfig'
import { config as CHAIN_CONFIG } from '@streamr/config'
import { CONFIG_TEST } from './ConfigTest'
import {
    type EnvironmentId,
    type KeyPairIdentityConfig,
    type StreamrClientConfig,
    type StrictStreamrClientConfig,
    DEFAULT_ENVIRONMENT_ID,
} from './ConfigTypes'

export const createStrictConfig = (input: StreamrClientConfig = {}): StrictStreamrClientConfig => {
    // TODO is it good to cloneDeep the input object as it may have object references (e.g. auth.ethereum)?
    let config = cloneDeep(input)
    const environment = config.environment ?? DEFAULT_ENVIRONMENT_ID
    config = applyEnvironmentDefaults(environment, config)
    const strictConfig = validateConfig(config)
    strictConfig.id ??= generateClientId()
    return strictConfig
}

const applyEnvironmentDefaults = (environmentId: EnvironmentId, data: StreamrClientConfig): StreamrClientConfig => {
    const defaults = CHAIN_CONFIG[environmentId]
    let config = merge({
        environment: environmentId,
        network: {
            controlLayer: {
                entryPoints: defaults.entryPoints
            }
        } as any,
        contracts: {
            ethereumNetwork: {
                chainId: defaults.id
            },
            streamRegistryChainAddress: defaults.contracts.StreamRegistry,
            streamStorageRegistryChainAddress: defaults.contracts.StreamStorageRegistry,
            storageNodeRegistryChainAddress: defaults.contracts.StorageNodeRegistry,
            sponsorshipFactoryChainAddress: defaults.contracts.SponsorshipFactory,
            rpcs: defaults.rpcEndpoints,
            theGraphUrl: defaults.theGraphUrl
        } as any
    }, data) as any
    if (environmentId === 'polygon') {
        config.contracts.ethereumNetwork = {
            highGasPriceStrategy: true,
            ...config.contracts.ethereumNetwork
        }
    } else if (environmentId === 'dev2') {
        config = merge(CONFIG_TEST, config)
    }
    return config
}

export const validateConfig = (data: unknown): StrictStreamrClientConfig | never => {
    if (!validate(data)) {
        throw new Error((validate as any).errors!.map((e: any) => {
            let text = e.instancePath + ' ' + e.message
            if (e.params.additionalProperty) {
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                text += `: ${e.params.additionalProperty}`
            }
            return text
        }).join('\n'))
    }
    return data as any
}

export const redactConfig = (config: StrictStreamrClientConfig): void => {
    if ((config.auth as KeyPairIdentityConfig)?.privateKey !== undefined) {
        (config.auth as KeyPairIdentityConfig).privateKey = '(redacted)'
    }
}
