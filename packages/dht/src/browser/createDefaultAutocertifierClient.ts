import type { AutoCertifierClient } from '@streamr/autocertifier-client'
import { ListeningRpcCommunicator } from '../transport/ListeningRpcCommunicator'

export const createDefaultAutocertifierClient = (
    _configFile: string,
    _autoCertifierUrl: string,
    _autoCertifierRpcCommunicator: ListeningRpcCommunicator,
    _wsServerPort: number
): AutoCertifierClient => {
    throw new Error(
        'AutoCertifierClient is not supported in browser environment'
    )
}
