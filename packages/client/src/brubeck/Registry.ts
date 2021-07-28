import 'core-js/es/reflect'
import 'reflect-metadata'
import { inspect } from '../utils/log'
import { injectable, autoInjectable, container } from 'tsyringe'
import { instanceId } from '../utils'

@injectable()
class Conf {
    id
    value: number
    constructor(value: number) {
        this.id = instanceId(this)
        this.value = value
        console.log(this.id, this)
    }
}

@injectable()
class DepA {
    id
    value = 0
    constructor(private config: Conf) {
        this.id = instanceId(this)
        console.log(this.id, config.value)
    }

    start() {
        return [this.value, this.config.value]
    }
}

// @injectable()
// class DepB {
    // id
    // depA
    // constructor(config: Conf, depA: DepA) {
        // this.id = instanceId(this)
        // console.log(this.id, config.value)
        // this.depA = depA
    // }
// }

export class Registry {
    depA: DepA
    constructor(v: number) {
        console.log(v)
        const childContainer = container.createChildContainer()
        childContainer.register(Conf, {
            useValue: new Conf(5)
        })
        debugger
        this.depA = childContainer.resolve(DepA)
    }

    start() {
        return this.depA.start()
    }
}
