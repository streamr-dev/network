import * as G from './GeneratorUtils'
import { pull, PushBuffer } from './PushBuffer'

/**
 * Pull from a source into self.
 */
export class PullBuffer<InType> extends PushBuffer<InType> {
    source: AsyncGenerator<InType>
    constructor(source: AsyncGenerator<InType>, ...args: ConstructorParameters<typeof PushBuffer>) {
        super(...args)
        this.source = source
        pull(this.source, this).catch(() => {})
    }

    map<NewOutType>(fn: G.GeneratorMap<InType, NewOutType>) {
        return new PullBuffer<NewOutType>(G.map(this, fn), this.bufferSize)
    }

    forEach(fn: G.GeneratorForEach<InType>) {
        return new PullBuffer(G.forEach(this, fn), this.bufferSize)
    }

    filter(fn: G.GeneratorFilter<InType>) {
        return new PullBuffer(G.filter(this, fn), this.bufferSize)
    }

    reduce<NewOutType>(fn: G.GeneratorReduce<InType, NewOutType>, initialValue: NewOutType) {
        return new PullBuffer(G.reduce(this, fn, initialValue), this.bufferSize)
    }
}
