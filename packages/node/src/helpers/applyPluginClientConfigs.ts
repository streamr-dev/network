import get from 'lodash/get'
import has from 'lodash/has'
import isEqual from 'lodash/isEqual'
import isString from 'lodash/isString'
import set from 'lodash/set'
import { Plugin } from '../Plugin'
import { StrictConfig } from '../config/config'

export const applyPluginClientConfigs = (plugins: Plugin<any>[], clientConfig: StrictConfig['client']): void => {
    for (const plugin of plugins) {
        for (const item of plugin.getClientConfig()) {
            if (!has(clientConfig, item.path)) {
                set(clientConfig, item.path, item.value)
            } else {
                const existingValue = get(clientConfig, item.path)
                if (!isEqual(item.value, existingValue)) {
                    const formattedValue = isString(existingValue) ? existingValue : `${JSON.stringify(existingValue)}`
                    throw new Error(
                        `Plugin ${plugin.name} doesn't support client config value "${formattedValue}" in ${item.path}`
                    )
                }
            }
        }
    }
}
