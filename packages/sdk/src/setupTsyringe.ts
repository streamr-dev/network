import 'reflect-metadata'

import { container } from 'tsyringe'
import { Resends } from './subscribe/Resends'
import { Subscriber } from './subscribe/Subscriber'
import { Tokens } from './tokens'

container.register(Tokens.Resends, {
    useClass: Resends,
})

container.register(Tokens.Subscriber, {
    useClass: Subscriber,
})
