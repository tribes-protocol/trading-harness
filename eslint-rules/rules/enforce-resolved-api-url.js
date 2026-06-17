import { createRule } from '../utils.js'

// In apps/web, forbid importing NEXT_PUBLIC_TERMINAL_API_ENDPOINT directly.
// Use resolvedApiUrl() from @/utils/TerminalApi instead.
export default createRule({
  name: 'enforce-resolved-api-url',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid direct import of NEXT_PUBLIC_TERMINAL_API_ENDPOINT; use resolvedApiUrl() instead',
      recommended: 'error'
    },
    messages: {
      useResolvedApiUrl:
        'Do not import NEXT_PUBLIC_TERMINAL_API_ENDPOINT directly. ' +
        'Use resolvedApiUrl() from @/utils/TerminalApi to construct API URLs.'
    },
    schema: []
  },
  defaultOptions: [],
  create(context) {
    const filename = context.filename || context.getFilename()

    // Exempt the definition site and the resolvedApiUrl implementation
    if (
      filename.endsWith('/common/env.ts') ||
      filename.endsWith('/utils/TerminalApi.ts')
    ) {
      return {}
    }

    return {
      ImportSpecifier(node) {
        if (
          node.imported &&
          node.imported.name === 'NEXT_PUBLIC_TERMINAL_API_ENDPOINT'
        ) {
          context.report({
            node,
            messageId: 'useResolvedApiUrl'
          })
        }
      }
    }
  }
})
