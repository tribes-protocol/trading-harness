import { createRule } from '../utils.js'

export default createRule({
  name: 'no-inline-do-name',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow inline DO name strings; use shared name functions from DurableObjectNames.ts',
      recommended: 'error'
    },
    messages: {
      useDoNameFunction:
        'Avoid inline DO name construction. Use a shared name function from @tribes-terminal/core/server (e.g. erc20DoName(), userDoName(id)).'
    },
    schema: []
  },
  defaultOptions: [],
  create(context) {
    const filename = (context.filename ?? '').replaceAll('\\', '/')
    const isDoNamesFile = filename.endsWith(
      '/packages/core/src/server/utils/DurableObjectNames.ts'
    )
    if (isDoNamesFile) {
      return {}
    }

    return {
      CallExpression(node) {
        const callee = node.callee
        if (callee.type !== 'MemberExpression' || callee.computed) return
        if (callee.property.type !== 'Identifier') return
        if (callee.property.name !== 'idFromName') return
        if (node.arguments.length < 1) return

        const arg = node.arguments[0]
        if (arg.type === 'Literal' || arg.type === 'TemplateLiteral') {
          context.report({ node: arg, messageId: 'useDoNameFunction' })
        }
      }
    }
  }
})
