import {
    AutoCertifierClient,
    HasSessionRequest,
    HasSessionResponse,
    type HasSession,
} from '@streamr/autocertifier-client'
import { ListeningRpcCommunicator } from '../transport/ListeningRpcCommunicator'

export const createDefaultAutocertifierClient = (
    configFile: string,
    autoCertifierUrl: string,
    autoCertifierRpcCommunicator: ListeningRpcCommunicator,
    wsServerPort: number
): AutoCertifierClient => {
    return new AutoCertifierClient(
        configFile,
        wsServerPort,
        autoCertifierUrl,
        (_serviceId: string, rpcMethodName: string, method: HasSession) => {
            autoCertifierRpcCommunicator.registerRpcMethod(
                HasSessionRequest,
                HasSessionResponse,
                rpcMethodName,
                method
            )
        }
    )
}
