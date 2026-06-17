import { createRule } from '../utils.js'

export default createRule({
  name: 'no-json-stringify',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow JSON.stringify(); prefer toJsonTreeString/ensureJsonTreeString from the shared lang utils',
      recommended: 'error'
    },
    messages: {
      useToJsonTreeString:
        'Avoid JSON.stringify(). Use toJsonTreeString() or ensureJsonTreeString() from the shared lang utils instead.'
    },
    schema: []
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee
        if (
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.object.type === 'Identifier' &&
          callee.object.name === 'JSON' &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'stringify'
        ) {
          context.report({ node: callee, messageId: 'useToJsonTreeString' })
        }
      }
    }
  }
})
