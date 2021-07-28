import { inject, Lifecycle, scoped } from 'tsyringe'
import { NetworkNodeOptions, startNetworkNode } from 'streamr-network'
import { pOnce, uuid, instanceId, counterId } from '../utils'
import { Context } from '../utils/Context'
import { Config } from './Config'

const uid = process.pid != null ? `p${process.pid}` : `${uuid().slice(-4)}${uuid().slice(0, 4)}`

@scoped(Lifecycle.ContainerScoped)
export default class BrubeckNode implements Context {
    options
    id
    debug

    constructor(context: Context, @inject(Config.Network) options: NetworkNodeOptions) {
        this.options = options
        this.id = instanceId(this, uid)
        this.debug = context.debug.extend(this.id)
    }

    connect = pOnce(async () => {
        this.disconnect.reset()
        this.debug('connect >>')
        await this.getNode()
        this.debug('connect <<')
    })

    disconnect = pOnce(async () => {
        this.debug('disconnect >>')
        const nodeTask = this.getNode()
        this.connect.reset()
        this.getNode.reset() // allow getting new node again
        const node = await nodeTask
        await node.stop()
        this.debug('disconnect <<')
    })

    getNode = pOnce(() => {
        return startNetworkNode({
            disconnectionWaitTime: 200,
            ...this.options,
            id: `${uid}-${counterId(this.id)}`,
            name: this.id,
        })
    })
}
