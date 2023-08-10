import { DhtRpcOptions, PeerDescriptor, keyFromPeerDescriptor } from "@streamr/dht"
import { ITemporaryConnectionRpcClient } from "../../proto/packages/trackerless-network/protos/NetworkRpc.client"
import { Remote } from "../Remote"
import { TemporaryConnectionRequest } from "../../proto/packages/trackerless-network/protos/NetworkRpc"
import { Logger } from "@streamr/utils"

const logger = new Logger(module)

export class RemoteTemporaryConnectionRpcServer extends Remote<ITemporaryConnectionRpcClient> {

    async openConnection(ownPeerDescriptor: PeerDescriptor): Promise<boolean> {
        const options: DhtRpcOptions = {
            sourceDescriptor: ownPeerDescriptor,
            targetDescriptor: this.remotePeerDescriptor,
        }
        const request: TemporaryConnectionRequest = {
            senderId: keyFromPeerDescriptor(ownPeerDescriptor)
        }
        try {
            const response = await this.client.openConnection(request, options)
            return response.accepted
        } catch (err: any) {
            logger.debug(`temporaryConnection to ${keyFromPeerDescriptor(this.getPeerDescriptor())} failed: ${err}`)
            return false
        }
    }
}
