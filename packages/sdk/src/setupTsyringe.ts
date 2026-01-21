import 'reflect-metadata'

import { container, Lifecycle } from 'tsyringe'
import { Resends } from './subscribe/Resends'
import { Subscriber } from './subscribe/Subscriber'
import { Tokens } from './tokens'
import { MessagePipelineFactory } from './subscribe/MessagePipelineFactory'

container.register(
    Tokens.Resends,
    {
        useClass: Resends,
    },
    {
        lifecycle: Lifecycle.ContainerScoped,
    }
)

container.register(
    Tokens.Subscriber,
    {
        useClass: Subscriber,
    },
    {
        lifecycle: Lifecycle.ContainerScoped,
    }
)

container.register(
    Tokens.MessagePipelineFactory,
    {
        useClass: MessagePipelineFactory,
    },
    {
        lifecycle: Lifecycle.ContainerScoped,
    }
)
