import { createRule } from '../utils.js'

export default createRule({
  name: 'enforce-bignumber-default-import',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require importing BigNumber as the default export from bignumber.js',
      recommended: 'error'
    },
    fixable: 'code',
    messages: {
      useDefaultImport:
        'Import BigNumber as the default export from bignumber.js: import BigNumber from \'bignumber.js\'.'
    },
    schema: []
  },
  defaultOptions: [],
  create(context) {
    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'bignumber.js') return
        if (node.specifiers.length !== 1) return

        const [specifier] = node.specifiers
        if (specifier.type !== 'ImportSpecifier') return
        if (specifier.imported.type !== 'Identifier') return
        if (specifier.imported.name !== 'BigNumber') return

        context.report({
          node: specifier,
          messageId: 'useDefaultImport',
          fix(fixer) {
            const localName = specifier.local.name
            const importKeyword = node.importKind === 'type' ? 'import type' : 'import'
            return fixer.replaceText(node, `${importKeyword} ${localName} from 'bignumber.js'`)
          }
        })
      }
    }
  }
})
