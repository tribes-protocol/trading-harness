import { createRule } from '../utils.js'

const PRIVY_AUTH_MODULE = '@privy-io/react-auth'
const RESTRICTED_USE_PRIVY_PROPERTIES = new Set(['login', 'logout', 'authenticated', 'ready'])
const DEFAULT_ALLOWED_PATH = '/providers/UserProvider.tsx'

function normalizeFilename(filename) {
  return (filename ?? '').replaceAll('\\', '/')
}

function isAllowedFile(filename, allowedPaths) {
  return allowedPaths.some((allowedPath) => filename.includes(allowedPath))
}

function isUsePrivyCall(node) {
  return (
    node?.type === 'CallExpression' &&
    node.callee?.type === 'Identifier' &&
    node.callee.name === 'usePrivy'
  )
}

function isVariableDeclaratorInitializedWithUsePrivy(declarator) {
  return declarator?.type === 'VariableDeclarator' && isUsePrivyCall(declarator.init)
}

function isIdentifierBoundToUsePrivy(identifier, context) {
  const sourceCode = context.sourceCode
  let scope = sourceCode.getScope(identifier)

  while (scope !== null && scope !== undefined) {
    const variable = scope.set.get(identifier.name)
    if (variable !== undefined) {
      const definition = variable.defs[0]
      if (definition?.type !== 'Variable') {
        return false
      }

      return isVariableDeclaratorInitializedWithUsePrivy(definition.node)
    }
    scope = scope.upper
  }

  return false
}

function resolvesToUsePrivy(node, context) {
  if (isUsePrivyCall(node)) {
    return true
  }

  if (node?.type === 'Identifier') {
    return isIdentifierBoundToUsePrivy(node, context)
  }

  return false
}

function getDestructuredPropertyName(propertyNode) {
  if (propertyNode.type !== 'Property' || propertyNode.computed) {
    return null
  }

  if (propertyNode.key.type === 'Identifier') {
    return propertyNode.key.name
  }

  return null
}

function reportRestrictedUsePrivyProperty(context, propertyNode, propertyName) {
  context.report({
    node: propertyNode,
    messageId: 'useUserAuthSession',
    data: { property: propertyName }
  })
}

function reportRestrictedUseLogin(context, node) {
  context.report({
    node,
    messageId: 'useUserLogin'
  })
}

function isPrivyAuthImportSource(source) {
  return source === PRIVY_AUTH_MODULE
}

function importSpecifierReferencesUseLogin(specifier) {
  if (specifier.type !== 'ImportSpecifier') {
    return false
  }

  if (specifier.imported.type === 'Identifier') {
    return specifier.imported.name === 'useLogin'
  }

  return false
}

export default createRule({
  name: 'no-use-privy-auth-session',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid usePrivy auth session fields and useLogin outside UserProvider; consume auth via useUser() instead',
      recommended: 'error'
    },
    messages: {
      useUserAuthSession:
        'Do not use `{{property}}` from usePrivy(). Use `useUser()` from UserProvider instead.',
      useUserLogin:
        'Do not import or call useLogin() outside UserProvider. Use useUser().login from UserProvider instead.'
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowedPaths: {
            type: 'array',
            items: { type: 'string' },
            description:
              'File path substrings where usePrivy auth session fields and useLogin are allowed'
          }
        },
        additionalProperties: false
      }
    ]
  },
  defaultOptions: [{ allowedPaths: [DEFAULT_ALLOWED_PATH] }],
  create(context) {
    const filename = normalizeFilename(context.filename ?? context.getFilename())
    const options = context.options[0] ?? {}
    const allowedPaths = options.allowedPaths ?? [DEFAULT_ALLOWED_PATH]

    if (isAllowedFile(filename, allowedPaths)) {
      return {}
    }

    function checkObjectPattern(patternNode, initNode) {
      if (!resolvesToUsePrivy(initNode, context)) {
        return
      }

      for (const propertyNode of patternNode.properties) {
        const propertyName = getDestructuredPropertyName(propertyNode)
        if (propertyName === null) {
          continue
        }
        if (RESTRICTED_USE_PRIVY_PROPERTIES.has(propertyName)) {
          reportRestrictedUsePrivyProperty(context, propertyNode, propertyName)
        }
      }
    }

    return {
      ImportDeclaration(node) {
        const source = node.source.type === 'Literal' ? node.source.value : null
        if (typeof source !== 'string' || !isPrivyAuthImportSource(source)) {
          return
        }

        for (const specifier of node.specifiers) {
          if (importSpecifierReferencesUseLogin(specifier)) {
            reportRestrictedUseLogin(context, specifier)
          }
        }
      },
      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'useLogin') {
          return
        }
        reportRestrictedUseLogin(context, node.callee)
      },
      VariableDeclarator(node) {
        if (node.id.type !== 'ObjectPattern' || node.init === null || node.init === undefined) {
          return
        }
        checkObjectPattern(node.id, node.init)
      },
      MemberExpression(node) {
        if (!resolvesToUsePrivy(node.object, context)) {
          return
        }
        if (node.property.type !== 'Identifier') {
          return
        }
        if (RESTRICTED_USE_PRIVY_PROPERTIES.has(node.property.name)) {
          reportRestrictedUsePrivyProperty(context, node.property, node.property.name)
        }
      }
    }
  }
})
