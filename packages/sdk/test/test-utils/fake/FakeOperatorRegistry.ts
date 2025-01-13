import { Methods } from '@streamr/test-utils'
import { Lifecycle, scoped } from 'tsyringe'
import { NetworkPeerDescriptor } from '../../../src/Config'
import { OperatorRegistry } from '../../../src/contracts/OperatorRegistry'

export const fakeEntrypoint = {
    nodeId: 'dadc0ded',
    websocket: {
        host: 'test',
        port: 12345,
        tls: true
    }
}

@scoped(Lifecycle.ContainerScoped)
export class FakeOperatorRegistry implements Methods<OperatorRegistry> {
    // eslint-disable-next-line class-methods-use-this
    async findRandomNetworkEntrypoints(): Promise<NetworkPeerDescriptor[]> {
        return [fakeEntrypoint]
    }

    // eslint-disable-next-line class-methods-use-this
    async findOperatorsOnStream(): Promise<NetworkPeerDescriptor[]> {
        return [fakeEntrypoint]
    }
}
