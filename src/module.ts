import {
	defineNuxtModule,
	createResolver,
	addImportsDir,
	addServerImportsDir, addTypeTemplate,
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
		addImportsDir(resolver.resolve('runtime/utils/shared'))
		addImportsDir(resolver.resolve('runtime/utils/shared/parsing'))
		addServerImportsDir(resolver.resolve('runtime/utils/shared'))
		addServerImportsDir(resolver.resolve('runtime/utils/shared/parsing'))

		addServerImportsDir(resolver.resolve('runtime/utils/server'))
		addServerImportsDir(resolver.resolve('runtime/utils/server/pagination'))
		addServerImportsDir(resolver.resolve('runtime/utils/server/parsing'))

		addTypeTemplate({
			src: resolver.resolve('./runtime/types/server/utility'),
			filename: 'types/utility-server.d.ts',
		})

		addTypeTemplate({
			src: resolver.resolve('./runtime/types/client/utility'),
			filename: 'types/utility-client.d.ts',
		})

		addTypeTemplate({
			src: resolver.resolve('./runtime/types/shared/utility'),
			filename: 'types/utility.d.ts',
		})

		addTypeTemplate({
			src: resolver.resolve('./runtime/types/shared/role-checking'),
			filename: 'types/role-checking.d.ts',
		})

		addTypeTemplate({
			src: resolver.resolve('./runtime/types/shared/permissions'),
			filename: 'types/permissions.d.ts',
		})

		_nuxt.options.build.transpile.push(
			'zod',
			'@internationalized/date'
		)

		_nuxt.options.alias['#nuxt-cs-utils'] = resolver.resolve(
			'./runtime',
		)

		// _nuxt.options.alias['@type32/nuxt-cs-utils'] = resolver.resolve(
		// 	'./runtime/types/client/utility',
		// )
		//
		// _nuxt.options.alias['@type32/nuxt-cs-utils'] = resolver.resolve(
		// 	'./runtime/types/shared/utility',
		// )
		//
		// _nuxt.options.alias['@type32/nuxt-cs-utils'] = resolver.resolve(
		// 	'./runtime/types/server/utility',
		// )
		//
		// _nuxt.options.alias['@type32/nuxt-cs-utils'] = resolver.resolve(
		// 	'./runtime/types/server/role-checking',
		// )
	},
})
