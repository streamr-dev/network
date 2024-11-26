# Interface: Eip1193Provider

The interface to an [[link-eip-1193]] provider, which is a standard
 used by most injected providers, which the [[BrowserProvider]] accepts
 and exposes the API of.

## Methods

### request()

> **request**(`request`): `Promise`\<`any`\>

See [[link-eip-1193]] for details on this method.

#### Parameters

• **request**

• **request.method**: `string`

• **request.params?**: `any`[] \| `Record`\<`string`, `any`\>

#### Returns

`Promise`\<`any`\>
