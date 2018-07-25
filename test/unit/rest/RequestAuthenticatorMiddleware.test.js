const assert = require('assert')
const sinon = require('sinon')
const authenticationMiddleware = require('../../../src/rest/RequestAuthenticatorMiddleware')

describe('AuthenticationMiddleware', () => {
    let request
    let response
    let next
    let streamFetcherStub
    let middlewareInstance

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
        middlewareInstance = authenticationMiddleware(streamFetcherStub)
    })

    context('given no authorization token', () => {
        it('delegates streamId to streamFetcher#authenticate without key', () => {
            streamFetcherStub.authenticate = sinon.stub()
            streamFetcherStub.authenticate.returns(Promise.resolve({}))

            middlewareInstance(request, response, next)

            sinon.assert.calledOnce(streamFetcherStub.authenticate)
            sinon.assert.calledWithExactly(
                streamFetcherStub.authenticate,
                'streamId', undefined, 'read',
            )
        })
    })

    it('responds 400 and error message if authorization header malformed', () => {
        streamFetcherStub.authenticate = sinon.stub()
        request.headers.authorization = 'doken 90rjsdojg9823jtopsdjglsd'

        middlewareInstance(request, response, next)

        sinon.assert.notCalled(next)
        sinon.assert.notCalled(streamFetcherStub.authenticate)
        sinon.assert.calledOnce(response.status)
        sinon.assert.calledOnce(response.send)
        sinon.assert.calledWithExactly(response.status, 400)
        sinon.assert.calledWithExactly(response.send, {
            error: 'Authorization header malformed. Should be of form "token authKey".',
        })
    })

    context('given well-formed authorization token', () => {
        beforeEach(() => {
            request.headers.authorization = 'tOkEn authKey'
            request.params = {
                id: 'streamId',
            }
        })

        it('delegates streamId and authKey to streamFetcher#authenticate', () => {
            streamFetcherStub.authenticate = sinon.stub()
            streamFetcherStub.authenticate.returns(Promise.resolve({}))

            middlewareInstance(request, response, next)

            sinon.assert.calledOnce(streamFetcherStub.authenticate)
            sinon.assert.calledWithExactly(
                streamFetcherStub.authenticate,
                'streamId', 'authKey', 'read',
            )
        })

        it('authenticates with an explicitly given permission', () => {
            streamFetcherStub.authenticate = sinon.stub()
            streamFetcherStub.authenticate.returns(Promise.resolve({}))

            middlewareInstance = authenticationMiddleware(streamFetcherStub, 'write')
            middlewareInstance(request, response, next)

            sinon.assert.calledOnce(streamFetcherStub.authenticate)
            sinon.assert.calledWithExactly(
                streamFetcherStub.authenticate,
                'streamId', 'authKey', 'write',
            )
        })

        it('responds 403 and error message if streamFetcher#authenticate results in error', (done) => {
            streamFetcherStub.authenticate = function () {
                return Promise.reject(new Error('error from always-fail mock'))
            }

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

        context('given streamFetcher#authenticate authenticates successfully', () => {
            beforeEach(() => {
                streamFetcherStub.authenticate = function (streamId) {
                    return Promise.resolve({
                        id: streamId,
                        partitions: 5,
                        name: 'my stream',
                        feed: {},
                        config: {},
                        description: 'description',
                        uiChannel: null,
                    })
                }
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
