import { Todo } from '../../types'
import assert from 'assert'
import sinon from 'sinon'
import { authenticator } from '../../../src/RequestAuthenticatorMiddleware'
import { HttpError } from '../../../src/errors/HttpError'

describe('AuthenticationMiddleware', () => {
    let request: Todo
    let response: Todo
    let next: Todo
    let streamFetcherStub: Todo
    let middlewareInstance: Todo

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
        middlewareInstance = authenticator(streamFetcherStub)
    })

    describe('given no authorization token', () => {
        it('delegates streamId to streamFetcher#authenticate without session token', () => {
            streamFetcherStub.authenticate = sinon.stub()
            streamFetcherStub.authenticate.returns(Promise.resolve({}))

            middlewareInstance(request, response, next)

            sinon.assert.calledOnce(streamFetcherStub.authenticate)
            sinon.assert.calledWithExactly(
                streamFetcherStub.authenticate,
                'streamId', undefined, 'stream_subscribe',
            )
        })
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

        it('delegates streamId and session token to streamFetcher#authenticate', () => {
            streamFetcherStub.authenticate = sinon.stub()
            streamFetcherStub.authenticate.returns(Promise.resolve({}))

            middlewareInstance(request, response, next)

            sinon.assert.calledOnce(streamFetcherStub.authenticate)
            sinon.assert.calledWithExactly(
                streamFetcherStub.authenticate,
                'streamId', 'session-token', 'stream_subscribe',
            )
        })

        it('authenticates with an explicitly given permission', () => {
            streamFetcherStub.authenticate = sinon.stub()
            streamFetcherStub.authenticate.returns(Promise.resolve({}))

            middlewareInstance = authenticator(streamFetcherStub, 'stream_publish')
            middlewareInstance(request, response, next)

            sinon.assert.calledOnce(streamFetcherStub.authenticate)
            sinon.assert.calledWithExactly(
                streamFetcherStub.authenticate,
                'streamId', 'session-token', 'stream_publish',
            )
        })

        it('responds 403 and error message if streamFetcher#authenticate results in 403', (done) => {
            streamFetcherStub.authenticate = () => Promise.reject(new HttpError(403, 'GET', ''))

            middlewareInstance(request, response, next)

            setTimeout(() => {
                sinon.assert.notCalled(next)
                sinon.assert.calledOnce(response.status)
                sinon.assert.calledOnce(response.send)
                sinon.assert.calledWithExactly(response.status, 403)
                sinon.assert.calledWithExactly(response.send, {
                    error: 'Authentication failed.',
                })
                done()
            })
        })

        it('responds with 404 if the stream is not found', (done) => {
            streamFetcherStub.authenticate = () => Promise.reject(new HttpError(404, 'GET', ''))

            middlewareInstance(request, response, next)

            setTimeout(() => {
                sinon.assert.notCalled(next)
                sinon.assert.calledOnce(response.status)
                sinon.assert.calledOnce(response.send)
                sinon.assert.calledWithExactly(response.status, 404)
                sinon.assert.calledWithExactly(response.send, {
                    error: 'Stream streamId not found.',
                })
                done()
            })
        })

        it('responds with whatever status code the backend returns', (done) => {
            streamFetcherStub.authenticate = () => Promise.reject(new HttpError(123, 'GET', ''))

            middlewareInstance(request, response, next)

            setTimeout(() => {
                sinon.assert.notCalled(next)
                sinon.assert.calledWithExactly(response.status, 123)
                done()
            })
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

            it('puts stream JSON in request object', (done) => {
                middlewareInstance(request, response, next)
                setTimeout(() => {
                    assert.deepEqual(request.stream, {
                        id: 'streamId',
                        partitions: 5,
                        name: 'my stream',
                        feed: {},
                        config: {},
                        description: 'description',
                        uiChannel: null,
                    })
                    done()
                })
            })
        })
    })
})
