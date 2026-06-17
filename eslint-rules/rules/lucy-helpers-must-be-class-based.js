import { createRule } from '../utils.js'

export default createRule({
  name: 'lucy-helpers-must-be-class-based',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow exported function-style Lucy helpers; use exported helper classes instead',
      recommended: 'error'
    },
    messages: {
      useClassHelper:
        'Lucy helpers must be exported classes. Move this helper API onto an exported class that owns LucyEnv in its constructor.'
    },
    schema: []
  },
  defaultOptions: [],
  create(context) {
    const filename = (context.filename ?? '').replaceAll('\\', '/')
    const isLucyHelperFile = filename.includes('/packages/core/src/lucy/helpers/')
    if (!isLucyHelperFile) {
      return {}
    }

    function reportExportedFunction(node) {
      context.report({ node, messageId: 'useClassHelper' })
    }

    return {
      ExportNamedDeclaration(node) {
        const declaration = node.declaration
        if (!declaration) {
          return
        }

        switch (declaration.type) {
          case 'FunctionDeclaration':
            reportExportedFunction(declaration)
            return
          case 'VariableDeclaration':
            for (const declarator of declaration.declarations) {
              if (!declarator.init) {
                continue
              }

              const isFunctionValue =
                declarator.init.type === 'ArrowFunctionExpression' ||
                declarator.init.type === 'FunctionExpression'
              if (isFunctionValue) {
                reportExportedFunction(declarator)
              }
            }
            return
        }
      },
      ExportDefaultDeclaration(node) {
        if (
          node.declaration.type === 'ArrowFunctionExpression' ||
          node.declaration.type === 'FunctionDeclaration' ||
          node.declaration.type === 'FunctionExpression'
        ) {
          reportExportedFunction(node.declaration)
        }
      }
    }
  }
})
