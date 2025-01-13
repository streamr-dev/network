/**
 * Utility Types
 */

import { F } from 'ts-toolbelt'

export type MaybeAsync<T extends F.Function> = T | F.Promisify<T> // Utility Type: make a function maybe async

export type StreamDefinition =
    | string
    | { id: string; partition?: number }
    | { stream: string; partition?: number }
    | { streamId: string; partition?: number }
