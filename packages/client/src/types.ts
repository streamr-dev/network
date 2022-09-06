/**
 * Utility Types
 */

import { F } from 'ts-toolbelt'

export type MaybeAsync<T extends F.Function> = T | F.Promisify<T> // Utility Type: make a function maybe async

export type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never }
export type XOR<T, U> = (T | U) extends object ? (Without<T, U> & U) | (Without<U, T> & T) : T | U

export type StreamDefinition = string
    | { id: string, partition?: number }
    | { stream: string, partition?: number }
    | { streamId: string, partition?: number }
