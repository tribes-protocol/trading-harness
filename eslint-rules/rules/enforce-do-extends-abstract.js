import { createRule } from '../utils.js'

const ABSTRACT_DO_PATH = '/apps/api/src/common/AbstractDurableObject.ts'

export default createRule({
  name: 'enforce-do-extends-abstract',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Durable Objects in apps/api must extend AbstractDurableObject and never `implements DurableObject` directly',
      recommended: 'error'
    },
    messages: {
      noImplementsDurableObject:
        'Class "{{ className }}" must not `implements DurableObject`. Extend AbstractDurableObject from `@/common/AbstractDurableObject` instead.',
      missingExtendsAbstract:
        'Class "{{ className }}" lives under apps/api/src/durableobjects but does not `extends AbstractDurableObject`. All Durable Objects must extend the shared base.'
    },
    schema: []
  },
  defaultOptions: [],
  create(context) {
    const filename = (context.filename ?? '').replaceAll('\\', '/')
    const isApiSource = filename.includes('/apps/api/src/')
    if (!isApiSource) return {}

    const isAbstractBase = filename.endsWith(ABSTRACT_DO_PATH)
    const isInDurableObjectsDir = filename.includes('/apps/api/src/durableobjects/')

    function getImplementsDurableObject(node) {
      const list = node.implements ?? []
      for (const clause of list) {
        const expr = clause.expression
        if (expr && expr.type === 'Identifier' && expr.name === 'DurableObject') {
          return clause
        }
      }
      return null
    }

    function extendsAbstractDurableObject(node) {
      const sup = node.superClass
      if (!sup) return false
      if (sup.type === 'Identifier' && sup.name === 'AbstractDurableObject') return true
      return false
    }

    function checkClass(node) {
      const className = node.id ? node.id.name : '<anonymous>'

      if (!isAbstractBase) {
        const implementsClause = getImplementsDurableObject(node)
        if (implementsClause !== null) {
          context.report({
            node: implementsClause,
            messageId: 'noImplementsDurableObject',
            data: { className }
          })
          return
        }
      }

      if (isInDurableObjectsDir && !extendsAbstractDurableObject(node)) {
        context.report({
          node: node.id ?? node,
          messageId: 'missingExtendsAbstract',
          data: { className }
        })
      }
    }

    return {
      ClassDeclaration: checkClass,
      ClassExpression(node) {
        if (node.id) checkClass(node)
      }
    }
  }
})
