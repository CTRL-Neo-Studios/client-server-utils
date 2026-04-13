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
		addImportsDir(resolver.resolve('runtime/shared/utils/shared'))
		addImportsDir(resolver.resolve('runtime/shared/utils/shared/parsing'))
		addServerImportsDir(resolver.resolve('runtime/shared/utils/shared'))
		addServerImportsDir(resolver.resolve('runtime/shared/utils/shared/parsing'))

		addServerImportsDir(resolver.resolve('runtime/shared/utils/server'))
		addServerImportsDir(resolver.resolve('runtime/shared/utils/server/pagination'))
		addServerImportsDir(resolver.resolve('runtime/shared/utils/server/parsing'))

		_nuxt.options.build.transpile.push(
			'zod',
			'@internationalized/date'
		)

		_nuxt.options.alias['#nuxt-cs-utils'] = resolver.resolve(
			'./runtime',
		)

		_nuxt.options.alias['@type32/nuxt-cs-utils'] = resolver.resolve(
			'./runtime/shared/types/client/utility',
		)

		_nuxt.options.alias['@type32/nuxt-cs-utils'] = resolver.resolve(
			'./runtime/shared/types/shared/utility',
		)

		_nuxt.options.alias['@type32/nuxt-cs-utils'] = resolver.resolve(
			'./runtime/shared/types/server/utility',
		)
	},
})
