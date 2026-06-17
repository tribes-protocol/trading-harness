import { createRule } from '../utils.js'

export default createRule({
  name: 'pascalcase-filename',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require TypeScript filenames to be PascalCase (e.g. HelloWorld.ts)',
      recommended: 'error'
    },
    messages: {
      notPascalCase:
        'Rename "{{basename}}" to PascalCase (e.g. HelloWorld.ts) — not kebab-case, snake_case, or camelCase.'
    },
    schema: []
  },
  defaultOptions: [],
  create(context) {
    const filename = context.filename ?? ''
    const basename = filename.split('/').pop() ?? ''
    // The name segment before the first dot, so Foo.test.ts is checked as "Foo".
    const stem = basename.split('.')[0] ?? ''

    // `index` is a required entry-point name (Pi loads extensions via index.ts).
    if (stem === '' || stem === 'index') {
      return {}
    }

    if (!/^[A-Z][A-Za-z0-9]*$/.test(stem)) {
      return {
        Program(node) {
          context.report({
            node,
            messageId: 'notPascalCase',
            data: { basename }
          })
        }
      }
    }

    return {}
  }
})
