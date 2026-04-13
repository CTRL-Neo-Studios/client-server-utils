import {
	defineNuxtModule,
	createResolver,
	addImportsDir,
	addServerImportsDir,
} from '@nuxt/kit'

// Module options TypeScript interface definition
export interface ModuleOptions {
}

export default defineNuxtModule<ModuleOptions>({
	meta: {
		name: '@type32/nuxt-cs-utils',
		configKey: 'csUtils',
	},
	// Default configuration options of the Nuxt module
	defaults: {},
	setup(_options, _nuxt) {
		const resolver = createResolver(import.meta.url)

		// Do not add the extension since the `.ts` will be transpiled to `.mjs` after `npm run prepack`
		addImportsDir(resolver.resolve('runtime/shared/utils'))
		addImportsDir(resolver.resolve('runtime/shared/utils/parsing'))

		addImportsDir(resolver.resolve('runtime/shared/types/client'))
		addImportsDir(resolver.resolve('runtime/shared/types/shared'))
		addServerImportsDir(resolver.resolve('runtime/shared/types/shared'))
		addServerImportsDir(resolver.resolve('runtime/shared/types/server'))

		// Nitro's directory scanner is not recursive by default, so each subdirectory
		// must be registered explicitly for server-side auto-imports to work.
		addServerImportsDir(resolver.resolve('runtime/shared/utils'))
		addServerImportsDir(resolver.resolve('runtime/shared/utils/parsing'))

		_nuxt.options.alias['@type32/nuxt-cs-utils'] = resolver.resolve(
			'./runtime/shared/utils',
		)

		_nuxt.options.alias['@type32/nuxt-cs-utils'] = resolver.resolve(
			'./runtime/shared/utils/parsing',
		)

		_nuxt.options.alias['@type32/nuxt-cs-utils'] = resolver.resolve(
			'./runtime/shared/types',
		)

		_nuxt.options.alias['@type32/nuxt-cs-utils'] = resolver.resolve(
			'./runtime/shared/types/client',
		)

		_nuxt.options.alias['@type32/nuxt-cs-utils'] = resolver.resolve(
			'./runtime/shared/types/shared',
		)

		_nuxt.options.alias['@type32/nuxt-cs-utils'] = resolver.resolve(
			'./runtime/shared/types/server',
		)
	},
})
