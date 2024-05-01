// Utility type EmitterOf<T>. By deriving an interface from this type, 
// you declare that the interface has the standard EventEmitter3  
// listener setter functions 'on', 'off', 'once' for each event type
// defined in T.

// Convert EventEmitter3 event types to corresponding listener
// setter function types (eg. types of 'on', 'off', 'once').
// For example, 
// message: (message: Message) => void
// -> message: (event: 'message', listener: (message: Message) => void) => void

type ListenerSetterTypes<T> = {
    [K in keyof T]: (event: K, listener: T[K]) => void
}

// In typescript, type of on overloaded function is
// the intersection of the overloaded function types 
// (https://stackoverflow.com/a/54887669).
// The following code builds the intersection type
// of the given listener setter function types
// (https://stackoverflow.com/a/66445507).

type Intersection<T> = {
    [K in keyof T]: (x: T[K]) => void
  }[keyof T] extends
    (x: infer I) => void ? I : never

type OverloadedListenerSetter<T> = Intersection<ListenerSetterTypes<T>> 

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type EmitterOf<T> = {
    on: OverloadedListenerSetter<T> 
    off: OverloadedListenerSetter<T>
    once: OverloadedListenerSetter<T>
}
