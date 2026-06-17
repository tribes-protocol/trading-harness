import { createRule } from '../utils.js'

export default createRule({
  name: 'no-controller-instantiation-outside-helper-cloudflare',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow API controller instantiation outside helpers/cloudflare.ts helper factories',
      recommended: 'error'
    },
    messages: {
      useHelperFactory:
        'Avoid creating "{{controllerName}}" here. Instantiate controllers only in helpers/cloudflare.ts factory functions.'
    },
    schema: []
  },
  defaultOptions: [],
  create(context) {
    const filename = (context.filename ?? '').replaceAll('\\', '/')
    const isApiSourceFile = filename.includes('/apps/api/src/')
    if (!isApiSourceFile) {
      return {}
    }

    const isAllowedHelperFactoryFile = filename.endsWith('/apps/api/src/helpers/cloudflare.ts')
    if (isAllowedHelperFactoryFile) {
      return {}
    }

    const importedControllerNames = new Set()

    return {
      ImportDeclaration(node) {
        if (typeof node.source.value !== 'string') return
        const source = node.source.value
        const isControllerImport =
          source.includes('/controllers/') || source.startsWith('@/controllers/')
        if (!isControllerImport) return

        for (const specifier of node.specifiers) {
          if (
            (specifier.type === 'ImportSpecifier' ||
              specifier.type === 'ImportDefaultSpecifier') &&
            specifier.local.type === 'Identifier' &&
            specifier.local.name.endsWith('Controller')
          ) {
            importedControllerNames.add(specifier.local.name)
          }
        }
      },
      NewExpression(node) {
        if (node.callee.type !== 'Identifier') return
        const controllerName = node.callee.name
        if (!importedControllerNames.has(controllerName)) return

        context.report({
          node,
          messageId: 'useHelperFactory',
          data: { controllerName }
        })
      }
    }
  }
})
