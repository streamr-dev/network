import { Lifecycle, scoped } from 'tsyringe'
import { OperatorRegistry } from '../../../src/registry/OperatorRegistry'
import { NetworkPeerDescriptor } from '../../../src/Config'
import { Methods } from '../types'

export const fakeEntrypoint = {
    nodeId: 'dadc0ded',
    websocket: {
        host: 'test',
        port: 12345,
        tls: true,
    }
}

@scoped(Lifecycle.ContainerScoped)
export class FakeOperatorRegistry implements Methods<OperatorRegistry> {

    // eslint-disable-next-line class-methods-use-this
    async findNetworkEntrypoints(): Promise<NetworkPeerDescriptor[]> {
        return new Promise((resolve) => resolve([fakeEntrypoint]))
    }

}
