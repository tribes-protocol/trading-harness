import { createRule } from '../utils.js'

export default createRule({
  name: 'no-direct-do-namespace-access',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow direct Durable Object namespace access; use helpers from utils/cloudflare.ts',
      recommended: 'error'
    },
    messages: {
      useHelper:
        'Avoid direct DO namespace access ({{envSource}}.{{namespace}}.{{method}}). Use a helper from utils/cloudflare.ts instead.'
    },
    schema: []
  },
  defaultOptions: [],
  create(context) {
    const filename = (context.filename ?? '').replaceAll('\\', '/')
    const isDoHelperFile = filename.endsWith('/apps/api/src/utils/cloudflare.ts')

    if (isDoHelperFile) {
      return {}
    }

    const DO_METHODS = ['idFromName', 'idFromString', 'get', 'newUniqueId']

    function getEnvSourceAndNamespace(obj) {
      if (obj.type !== 'MemberExpression' || obj.computed) return null
      if (obj.property.type !== 'Identifier') return null

      const namespace = obj.property.name
      if (!namespace.endsWith('_DO')) return null

      if (obj.object.type === 'Identifier' && obj.object.name === 'env') {
        return { envSource: 'env', namespace }
      }

      if (obj.object.type !== 'MemberExpression' || obj.object.computed) return null
      if (obj.object.property.type !== 'Identifier' || obj.object.property.name !== 'env')
        return null

      const envOwner = obj.object.object
      if (envOwner.type === 'Identifier') {
        return { envSource: `${envOwner.name}.env`, namespace }
      }
      if (envOwner.type === 'ThisExpression') {
        return { envSource: 'this.env', namespace }
      }

      return { envSource: '*.env', namespace }
    }

    return {
      CallExpression(node) {
        const callee = node.callee
        if (callee.type !== 'MemberExpression' || callee.computed) return
        if (callee.property.type !== 'Identifier') return
        if (!DO_METHODS.includes(callee.property.name)) return

        const match = getEnvSourceAndNamespace(callee.object)
        if (!match) return

        context.report({
          node: callee,
          messageId: 'useHelper',
          data: {
            envSource: match.envSource,
            namespace: match.namespace,
            method: callee.property.name
          }
        })
      }
    }
  }
})
