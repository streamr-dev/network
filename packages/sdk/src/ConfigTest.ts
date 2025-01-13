import { toEthereumAddress } from '@streamr/utils'
import { StreamrClientConfig } from './Config'
import { MIN_KEY_LENGTH } from './encryption/RSAKeyPair'

/**
 * Streamr client constructor options that work in the test environment
 */
export const CONFIG_TEST: StreamrClientConfig = {
    network: {
        controlLayer: {
            entryPointDiscovery: {
                enabled: false
            },
            websocketPortRange: {
                min: 32400,
                max: 32800
            },
            iceServers: [],
            webrtcAllowPrivateAddresses: true,
            websocketServerEnableTls: false
        }
    },
    encryption: {
        rsaKeyLength: MIN_KEY_LENGTH
    },
    _timeouts: {
        theGraph: {
            indexTimeout: 10 * 1000,
            indexPollInterval: 500
        },
        storageNode: {
            timeout: 30 * 1000,
            retryInterval: 500
        },
        ensStreamCreation: {
            timeout: 20 * 1000,
            retryInterval: 500
        }
    },
    metrics: false
}

export const DOCKER_DEV_STORAGE_NODE = toEthereumAddress('0xde1112f631486CfC759A50196853011528bC5FA0')
