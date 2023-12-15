/**  
* Checks that the implementation of an interface has
* the public methods defined in the interface with the exactly same
* parameter types as the interface.

* @param C - the class that implements the interface
* @param I - the interface
* @returns - an interface that is otherwise the same as I, but the methods
*  whose parameters do not match between C and I are marked with a type that
*  causes a compiler error when used in combination with the 'implements' keyword.
* @example ```ts class MyClass implements strictly<MyClass, MyInterface> { ... } ```
*/

export type strictly<C, I> = {
    [k in keyof I]:
        // check if it is a function in I
        I[k] extends (...args: infer A) => infer _R
            // if it is a function, check if the exists in C
            ? ( k extends keyof C
                // if the key exists in C, check if it is a function in C
                ? ( C[k] extends (...args: infer B) => infer _Q 
                    // if it is a function in C, check if the parameters match one way
                   ? (A extends B
                        //if parameters match one way, check if they match the other way
                        ? (B extends A  
                            // if parameters match also the other way, pass it through
                            ? I[k] 
                            //else if parameters do not match the other way, pass it through with a type that causes compiler error
                            : I[k] & 'The function parameters differ between the implementation and the interface'
                        )  
                    // else if parameters do not match one way, pass it through with a type that causes compiler error
                    : I[k] & 'The function parameters differ between the implementation and the interface'
                    ) 
                // else if not a function in C, pass it through
                : I[k]
                ) 
            // else if not exists in C, pass it through
            : I[k]
            )
        // else if not a function in I, pass it through 
        : I[k]
}

/**  
* Ensures that the callback passed as an argument has exactly the same
* parameter types as in the type definition. This utility type is
* to be used in the definitions of functions that take callbacks as arguments.
* No action from the callers of the function is required.
* @param C - placeholder parameter for the type of the callback function passed as an argument
* to the function call. NOTE: the function needs to be converted to a generic in order to use strictCb. 
* The compiler will automatically infer parameter C from the context when the function is called, and 
* the caller of the function does not need to know that the function is generic. 
* @param I - F the usual type definition of the callback function. 
* @returns - strict callback function type that causes a compiler error if the parameters
* of the callback passed as an argument do not match exactly the parameters of the callback type definition
* @example ```ts  fetchValue<C>(callback: strictCb<C, (result: string) => void>): void {
        callback('some value')
    } ```
*/

export type strictCb<C, F extends (...args: any) => any> = 
    C extends (...args: infer B) => infer Q
        ? ( F extends (...args: infer A) => infer R
            ? ( A extends B
                ? ( B extends A
                    ? ( Q extends R
                        ? ( R extends Q
                            ? C
                            : F & 'The return values of the callbacks differ'
                        )
                        : F & 'The return values of the callbacks differ'
                    )
                    : F & 'The types of the parameters of the callbacks differ'
                )
                : F & 'The types of the parameters of the callbacks differ' 
            ) 
            : F & 'The callback is not a function'
        )
        : F & 'The callback is not a function'
