import { ESLintUtils } from '@typescript-eslint/utils'
import { createRule } from '../utils.js'

export default createRule({
  name: 'no-bignumber-to-string',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow BigNumber.prototype.toString(); prefer toFixed(decimals)',
      recommended: 'error'
    },
    messages: {
      useToFixed: 'Avoid calling toString() on BigNumber. Use toFixed(decimals) instead.'
    },
    schema: []
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context)
    const checker = services.program.getTypeChecker()

    function isBigNumberType(tsType) {
      // Robust string-based check to handle unions and generics
      const typeText = checker.typeToString(tsType)
      if (typeText.includes('BigNumber')) return true
      // Union types
      if ('types' in tsType && Array.isArray(tsType.types)) {
        return tsType.types.some((t) => checker.typeToString(t).includes('BigNumber'))
      }
      return false
    }

    return {
      CallExpression(node) {
        if (node.callee?.type !== 'MemberExpression') return
        const member = node.callee
        const property = member.property
        const isToString =
          !member.computed && property.type === 'Identifier' && property.name === 'toString'
        if (!isToString) return

        try {
          const tsObjectExpr = services.esTreeNodeToTSNodeMap.get(member.object)
          const type = checker.getTypeAtLocation(tsObjectExpr)
          if (isBigNumberType(type)) {
            context.report({ node: property, messageId: 'useToFixed' })
          }
        } catch {
          // If types are unavailable, silently skip
        }
      }
    }
  }
})
