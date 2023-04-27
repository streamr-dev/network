export type BrandedString<T> = string & { __brand: T }

export type Events<T> = { [K in keyof T]: (payload: any) => void }
