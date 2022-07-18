import * as G from './GeneratorUtils'
import { pull, PushBuffer } from './PushBuffer'

/**
 * Pull from a source into self.
 */
export class PullBuffer<InType> extends PushBuffer<InType> {
    private source: AsyncGenerator<InType>
    
    constructor(source: AsyncGenerator<InType>, ...args: ConstructorParameters<typeof PushBuffer>) {
        super(...args)
        this.source = source
        pull(this.source, this).catch(() => {})
    }

    override map<NewOutType>(fn: G.GeneratorMap<InType, NewOutType>): PullBuffer<NewOutType> {
        return new PullBuffer<NewOutType>(G.map(this, fn), this.bufferSize)
    }

    override forEach(fn: G.GeneratorForEach<InType>): PullBuffer<InType> {
        return new PullBuffer(G.forEach(this, fn), this.bufferSize)
    }

    override filter(fn: G.GeneratorFilter<InType>): PullBuffer<InType> {
        return new PullBuffer(G.filter(this, fn), this.bufferSize)
    }

    override reduce<NewOutType>(fn: G.GeneratorReduce<InType, NewOutType>, initialValue: NewOutType): PullBuffer<NewOutType> {
        return new PullBuffer(G.reduce(this, fn, initialValue), this.bufferSize)
    }
}
