import { HttpError } from '../../../src/errors/HttpError'

describe('HttpError', () => {
    it('has expected message', () => {
        const httpError = new HttpError(404, 'POST', 'https://www.example.com/api/')
        expect(httpError.message).toEqual('POST https://www.example.com/api/ responded with status code 404')
    })
})
