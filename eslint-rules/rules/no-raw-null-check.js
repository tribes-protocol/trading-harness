import { createRule } from '../utils.js'

export default createRule({
  name: 'no-raw-null-check',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow raw null/undefined checks; prefer isNullish() from @tribes-terminal/core/shared',
      recommended: 'error'
    },
    messages: {
      useIsNullish:
        'Avoid raw null/undefined checks. Use isNullish(value) or !isNullish(value) from @tribes-terminal/core/shared.'
    },
    schema: []
  },
  defaultOptions: [],
  create(context) {
    const filename = context.filename ?? ''
    const isIsNullishImpl =
      filename.endsWith('/packages/core/src/shared/utils/lang.ts') ||
      filename.endsWith('/packages/foundation/src/utils/lang.ts')
    if (isIsNullishImpl) {
      return {}
    }

    function isUndefinedLiteral(node) {
      if (node.type === 'Identifier' && node.name === 'undefined') {
        return true
      }
      return (
        node.type === 'UnaryExpression' &&
        node.operator === 'void' &&
        node.argument.type === 'Literal' &&
        node.argument.value === 0
      )
    }

    function isNullishLiteral(node) {
      if (node.type === 'Literal' && node.value === null) {
        return true
      }
      return isUndefinedLiteral(node)
    }

    return {
      BinaryExpression(node) {
        const isEqualityOperator =
          node.operator === '===' ||
          node.operator === '!==' ||
          node.operator === '==' ||
          node.operator === '!='
        if (!isEqualityOperator) return

        if (isNullishLiteral(node.left) || isNullishLiteral(node.right)) {
          context.report({ node, messageId: 'useIsNullish' })
        }
      }
    }
  }
})
