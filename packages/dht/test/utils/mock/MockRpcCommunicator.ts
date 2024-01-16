import { RoutingRpcCommunicator } from '../../../src/transport/RoutingRpcCommunicator'

export class MockRpcCommunicator extends RoutingRpcCommunicator {
    constructor() {
        super('mock-service', async () => {})
    }
}
