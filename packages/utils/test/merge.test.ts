import { merge } from '../src/merge'

describe('merge', () => {

    it('two objects', () => {
        const o1 = {
            foo: 123,
            bar: 456,
            lorem: undefined
        }
        const o2 = {
            foo: 789,
            bar: undefined,
            ipsum: undefined
        }
        expect(merge(o1, o2)).toEqual({
            foo: 789,
            bar: 456
        })
    })

    it('multiple objects', () => {
        const o1 = {
            foo: 1,
        }
        const o2 = {
            foo: 2,
        }
        const o3 = {
            foo: 3,
        }
        expect(merge(o1, o2, o3)).toEqual({
            foo: 3
        })
    })

    it('no objects', () => {
        expect(merge()).toEqual({})
    })

    it('do not mutate', () => {
        const o1 = {
            foo: 123,
            bar: 456,
            lorem: undefined
        }
        const o2 = {
            foo: 789,
            bar: undefined,
            ipsum: undefined
        }
        merge(o1, o2)
        expect(o1).toEqual({
            foo: 123,
            bar: 456,
            lorem: undefined
        })
        expect(o2).toEqual({
            foo: 789,
            bar: undefined,
            ipsum: undefined
        })
    })

    it('not deeply', () => {
        interface Bar {
            lorem: number | undefined
            ipsum: number | undefined
        }
        const o1 = {
            foo: 1,
            bar: {
                lorem: undefined,
                ipsum: 1
            } as Bar
        }
        const o2 = {
            foo: 2,
            bar: {
                lorem: 2,
                ipsum: undefined
            } as Bar
        }
        expect(merge(o1, o2)).toEqual({
            foo: 2,
            bar: {
                lorem: 2,
                ipsum: undefined
            }
        })
    })

    it('undefineds are skipped', () => {
        const o1 = {
            foo: 1,
        }
        const o2 = {
            foo: 2,
        }
        expect(merge(undefined, o1, undefined, o2, undefined)).toEqual({
            foo: 2
        })
    })
})
