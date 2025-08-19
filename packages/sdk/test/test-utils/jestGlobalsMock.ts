/**
 * This is a hack to get around the "Do not import `@jest/globals` outside of the Jest test environment" error in Karma
 * browser tests. This file is aliased by webpack to replace `@jest/globals` in the Karma browser tests. The root cause
 * is that library `jest-mock-extended` imports `@jest/globals` which leads to the error. Once the following PR
 * https://github.com/marchaos/jest-mock-extended/pull/135, or a similar change, is landed & released, we can update
 * `jest-mock-extend` and get rid of this hack.
*/

import { fn } from 'jest-mock'

export const jest = {
    fn
}
