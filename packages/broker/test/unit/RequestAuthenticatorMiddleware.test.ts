import sinon from 'sinon'
import { authenticator } from '../../src/RequestAuthenticatorMiddleware'
import { StreamPermission } from 'streamr-client'

describe('AuthenticationMiddleware', () => {
    let request: any
    let response: any
    let next: any
    let streamFetcherStub: any
    let middlewareInstance: any

    beforeEach(() => {
        request = {
            headers: {},
            params: {
                id: 'streamId',
            },
        }
        response = {
            status: sinon.stub(),
            send: sinon.spy(),
        }
        response.status.returns(response)
        next = sinon.spy()
        streamFetcherStub = {}
        middlewareInstance = authenticator(streamFetcherStub, StreamPermission.SUBSCRIBE, 'fakeaddress')
    })

    it('responds 400 and error message if authorization header malformed', () => {
        streamFetcherStub.authenticate = sinon.stub()
        request.headers.authorization = 'foobar 90rjsdojg9823jtopsdjglsd'

        middlewareInstance(request, response, next)

        sinon.assert.notCalled(next)
        sinon.assert.notCalled(streamFetcherStub.authenticate)
        sinon.assert.calledOnce(response.status)
        sinon.assert.calledOnce(response.send)
        sinon.assert.calledWithExactly(response.status, 400)
        sinon.assert.calledWithExactly(response.send, {
            error: 'Authorization header malformed. Should be of form "Bearer session-token".',
        })
    })

    describe('given well-formed session token as authorization header', () => {
        beforeEach(() => {
            request.headers.authorization = 'bEaReR session-token'
            request.params = {
                id: 'streamId',
            }
        })

        describe('given streamFetcher#authenticate authenticates successfully', () => {
            beforeEach(() => {
                streamFetcherStub.authenticate = (streamId: string) => Promise.resolve({
                    id: streamId,
                    partitions: 5,
                    name: 'my stream',
                    feed: {},
                    config: {},
                    description: 'description',
                    uiChannel: null,
                })
            })

            it('invokes callback "next"', (done) => {
                middlewareInstance(request, response, next)
                setTimeout(() => {
                    sinon.assert.calledOnce(next)
                    done()
                })
            })
        })
    })
})
