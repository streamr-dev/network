import { wait } from '@streamr/utils'
import { ServerRegistry } from '../../src/ServerRegistry'
import { RpcMessage } from '../../generated/ProtoRpc'
import { Any } from '../../generated/google/protobuf/any'
import { HelloRequest, HelloResponse } from '../proto/HelloRpc'

describe('ServerRegistry', () => {
    let serverRegistry: ServerRegistry

    const request: HelloRequest = {
        myName: 'test'
    }

    const requestWrapper: RpcMessage = {
        header: {
            method: 'sayHello',
            request: 'request'
        },
        body: Any.pack(request, HelloRequest),
        requestId: 'request-id'
    }

    beforeEach(() => {
        serverRegistry = new ServerRegistry()
    })

    it('Can bind methods', async () => {
        serverRegistry.registerRpcMethod(HelloRequest, HelloResponse, 'sayHello', async () => {
            return {
                greeting: 'hello'
            }
        })
        const res = await serverRegistry.handleRequest(requestWrapper, {} as any)
        expect(Any.unpack(res, HelloResponse).greeting).toEqual('hello')
    })

    it('can set server timeouts', async () => {
        serverRegistry.registerRpcMethod(
            HelloRequest,
            HelloResponse,
            'sayHello',
            async () => {
                await wait(2000)
                return {
                    greeting: 'hello'
                }
            },
            { timeout: 2100 }
        )
        const res = await serverRegistry.handleRequest(requestWrapper, {} as any)
        expect(Any.unpack(res, HelloResponse).greeting).toEqual('hello')
    })
})
