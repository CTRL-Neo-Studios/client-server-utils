import {defineNuxtModule, addPlugin, createResolver, addImportsDir} from '@nuxt/kit'

// Module options TypeScript interface definition
export interface ModuleOptions {}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@ctrl-neo/nuxt-cs-utils',
    configKey: 'csUtils',
  },
  // Default configuration options of the Nuxt module
  defaults: {},
  setup(_options, _nuxt) {
    const resolver = createResolver(import.meta.url)

    // Do not add the extension since the `.ts` will be transpiled to `.mjs` after `npm run prepack`
    addImportsDir(resolver.resolve('./runtime/shared/utils'))
  },
})
