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
