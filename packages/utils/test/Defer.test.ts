import { Defer } from '../src/Defer'

describe('Defer', () => {
    it('can be constructed', () => {
        expect(() => new Defer()).not.toThrow()
    })

    it('pre-resolved value', async () => {
        const defer = new Defer<string>()
        defer.resolve('foobar')
        const actual = await defer
        expect(actual).toEqual('foobar')
    })

    it('post-resolved value', (done) => {
        const defer = new Defer<string>()
        ;(async () => {
            const value = await defer
            expect(value).toEqual('foobar')
            done()
        })()
        defer.resolve('foobar')
    })

    it('safe-guarded against unhandled promise rejections', () => {
        const defer = new Defer()
        defer.reject(new Error('should not result in unhandled promise rejection'))
    })

    it('pre-rejected value', () => {
        const defer = new Defer()
        defer.reject(new Error('expected error'))
        return expect(defer).rejects.toEqual(new Error('expected error'))
    })

    it('post-rejected value', (done) => {
        const defer = new Defer()
        defer.catch((err) => {
            expect(err).toEqual(new Error('expected error'))
            done()
        })
        defer.reject(new Error('expected error'))
    })

    it('wrapped function returning value', async () => {
        const defer = new Defer()
        const wrappedFn = defer.wrap((str: string) => 'foo' + str)
        wrappedFn('bar')
        const value = await defer
        expect(value).toEqual('foobar')
    })

    it('wrapped function throwing error', () => {
        const defer = new Defer()
        const wrappedFn = defer.wrap((_str: string) => {
            throw new Error('expected error')
        })
        wrappedFn('bar').catch(() => {}) // notice: errors need be handled
        return expect(defer).rejects.toEqual(new Error('expected error'))
    })

    it('wrapped async function returning value', async () => {
        const defer = new Defer()
        const wrappedFn = defer.wrap(async (str: string) => 'foo' + str)
        wrappedFn('bar')
        const value = await defer
        expect(value).toEqual('foobar')
    })

    it('wrapped async function throwing error', () => {
        const defer = new Defer()
        const wrappedFn = defer.wrap(async (_str: string) => {
            throw new Error('expected error')
        })
        wrappedFn('bar').catch(() => {}) // notice: errors need be handled
        return expect(defer).rejects.toEqual(new Error('expected error'))
    })
})
