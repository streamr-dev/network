interface HavingTestInterface { testInterfaceType?: any }

/**
 * Gets the Testing Interface
 * @param obj The object to get the testing interface from
 * @returns The testing interface
 */
export function getTI<T extends HavingTestInterface> (obj: T): NonNullable<T['testInterfaceType']> {
    return (obj as unknown as any)['testInterface']!
}