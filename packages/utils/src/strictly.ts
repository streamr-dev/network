/**  
* sI, the strictInterface utility type  
* Checks that the implementation of an interface has
* the public methods defined in the interface with the exactly same
* parameter types as the interface.

* @param C - the class that implements the interface
* @param I - the interface
* @returns - an interface that is otherwise the same as I, but the methods
*  whose parameters do not match between C and I are marked with a type that
*  causes a compiler error when used in combination with the 'implements' keyword.
* @example ```

// usage with a an interface

class MyClass implements sI<MyClass, MyInterface> { ... } 

// usage with an abstract class

abstract class MyAbstractClass { ... }
class MyClass extends MyAbstractClass implements sI<MyClass, MyAbstractClass> { ... }

```
*/

export type sI<C, I> = {
    [k in keyof I]:
        // check if it is a function in I
        I[k] extends (...args: infer A) => infer R
            // if it is a function, check if the exists in C
            ? ( k extends keyof C
                // if the key exists in C, check if it is a function in C
                ? ( C[k] extends (...args: infer B) => infer Q 
                    // if it is a function in C, check if the parameters match one way
                   ? (A extends B
                        //if parameters match one way, check if they match the other way
                        ? (B extends A  
                            // if parameters match also the other way, check the return types
                            ? ( R extends Q
                                ? ( Q extends R
                                    // return values match both ways, pass it through  
                                    ? I[k] 
                                    : I[k] & 'The return values of the functions differ between the implementation and the interface'
                                )
                                : I[k] & 'The return values of the functions differ between the implementation and the interface'
                            )
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
* sF, the strictFunction utility type.
* Ensures that the function passed as an argument has exactly the same
* parameter types and return type as in the type definition. This utility type is
* especially useful in the defining of functions that take callbacks as arguments.
* @param C - function to be checked.
* @param I - function type definition to check the function against. 
* @returns - strict function type that causes a compiler error if the parameter or return types
* do not match exactly the parameters of the function type definition
* @example ```
// Usage in a callback function definition
// NOTE: the function needs to be converted to a generic in order to use strictCb. 
// The compiler will automatically infer parameter C from the context when the function is called, and 
// the caller of the function does not need to know that the function is generic.  

fetchValue<C>(callback: sF<C, (result: string) => void>): void {
        callback('some value')
} 
```
*/

export type sF<C, F extends (...args: any) => any> = 
    C extends (...args: infer B) => infer Q
        ? ( F extends (...args: infer A) => infer R
            ? ( A extends B
                ? ( B extends A
                    ? ( Q extends R
                        ? ( R extends Q
                            ? C
                            : F & 'The return values of the functions differ'
                        )
                        : F & 'The return values of the functions differ'
                    )
                    : F & 'The types of the parameters of the functions differ'
                )
                : F & 'The types of the parameters of the functions differ' 
            ) 
            : F & 'The parameter is not a function'
        )
        : F & 'The parameter is not a function'
