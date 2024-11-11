export type BrandedString<T> = string & { __brand: T }

export type Events<T> = { [K in keyof T]: (payload: any) => void }

export type ChangeFieldType<T, K extends keyof T, V> = Omit<T, K> & Record<K, V>
