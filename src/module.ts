import {
	defineNuxtModule,
	createResolver,
	addImportsDir,
	addServerImportsDir,
	addTypeTemplate,
} from '@nuxt/kit'

export interface ModuleOptions {}

export default defineNuxtModule<ModuleOptions>({
	meta: {
		name: '@type32/nuxt-cs-utils',
		configKey: 'csUtils',
	},
	defaults: {},
	setup(_options, _nuxt) {
		const resolver = createResolver(import.meta.url)

		// ---- Auto-imports (shared — available in both client and server) ----
		addImportsDir(resolver.resolve('runtime/shared/utils/shared'))
		addImportsDir(resolver.resolve('runtime/shared/utils/shared/parsing'))
		addImportsDir(resolver.resolve('runtime/shared/utils/shared/permissions'))

		// ---- Auto-imports (server-only) -------------------------------------
		addServerImportsDir(resolver.resolve('runtime/shared/utils/shared'))
		addServerImportsDir(resolver.resolve('runtime/shared/utils/shared/parsing'))
		addServerImportsDir(resolver.resolve('runtime/shared/utils/shared/permissions'))
		addServerImportsDir(resolver.resolve('runtime/shared/utils/server'))
		addServerImportsDir(resolver.resolve('runtime/shared/utils/server/pagination'))
		addServerImportsDir(resolver.resolve('runtime/shared/utils/server/parsing'))

		// ---- Type templates -------------------------------------------------
		// Using getContents so these work in both local dev and published installs.
		// (src-based templates break in published packages because .ts sources
		//  are not included in the dist output.)
		addTypeTemplate({
			filename: 'types/nuxt-cs-utils.d.ts',
			getContents: () => `// @type32/nuxt-cs-utils — augmented types\nexport {}`,
		})

		// ---- Transpile third-party deps used at runtime ---------------------
		_nuxt.options.build.transpile.push('zod', '@internationalized/date')

		// ---- Aliases --------------------------------------------------------
		// #nuxt-cs-utils  → internal alias (kept for backwards compatibility)
		_nuxt.options.alias['#nuxt-cs-utils'] = resolver.resolve('./runtime')

		// @type32/nuxt-cs-utils         → shared public surface (types + utils)
		// @type32/nuxt-cs-utils/server  → server subpath
		// @type32/nuxt-cs-utils/client  → client subpath
		_nuxt.options.alias['@type32/nuxt-cs-utils'] = resolver.resolve('./runtime/index')
		_nuxt.options.alias['@type32/nuxt-cs-utils/server'] = resolver.resolve('./runtime/server')
		_nuxt.options.alias['@type32/nuxt-cs-utils/client'] = resolver.resolve('./runtime/client')
	},
})
