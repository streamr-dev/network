import { DhtRpcOptions, PeerDescriptor, keyFromPeerDescriptor } from "@streamr/dht"
import { IInspectionRpcClient } from "../../proto/packages/trackerless-network/protos/NetworkRpc.client"
import { Remote } from "../Remote"
import { InspectConnectionRequest } from "../../proto/packages/trackerless-network/protos/NetworkRpc"
import { Logger } from "@streamr/utils"

const logger = new Logger(module)

export class RemoteInspectionRpcServer extends Remote<IInspectionRpcClient> {

    async openInspectConnection(ownPeerDescriptor: PeerDescriptor): Promise<boolean> {
        const options: DhtRpcOptions = {
            sourceDescriptor: ownPeerDescriptor,
            targetDescriptor: this.remotePeerDescriptor,
        }
        const request: InspectConnectionRequest = {
            senderId: keyFromPeerDescriptor(ownPeerDescriptor)
        }
        try {
            const response = await this.client.openInspectConnection(request, options)
            return response.accepted
        } catch (err: any) {
            logger.debug(`inspectConnection to ${keyFromPeerDescriptor(this.getPeerDescriptor())} failed: ${err}`)
            return false
        }
    }
}
