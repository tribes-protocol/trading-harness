import { createRule } from '../utils.js'

export default createRule({
  name: 'no-cross-module-logger',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce that each core submodule imports logger from its own utils/Logger, not from another layer',
      recommended: 'error'
    },
    messages: {
      wrongLoggerImport:
        'Import logger from your own module ("@/{{expectedLayer}}/utils/Logger"), not from "{{importPath}}".',
      noLoggerBarrelExport:
        'Do not export "logger" from barrel files. Only export configure functions (e.g. configureServerLogger).'
    },
    schema: []
  },
  defaultOptions: [],
  create(context) {
    const filename = (context.filename ?? '').replaceAll('\\', '/')

    if (!filename.includes('/packages/core/src/')) return {}

    const layerMatch = filename.match(
      /\/packages\/core\/src\/(shared|client|server|lucy)\//
    )
    if (!layerMatch) return {}
    const sourceLayer = layerMatch[1]

    const isBarrelIndex =
      filename.endsWith(`/packages/core/src/${sourceLayer}/index.ts`)

    return {
      ImportDeclaration(node) {
        const importPath = node.source?.value
        if (typeof importPath !== 'string') return

        // Only check value imports of 'logger'
        const hasLoggerValueImport = node.specifiers.some(
          (s) =>
            s.type === 'ImportSpecifier' &&
            s.imported.type === 'Identifier' &&
            s.imported.name === 'logger' &&
            node.importKind !== 'type' &&
            s.importKind !== 'type'
        )
        if (!hasLoggerValueImport) return

        const expectedPath = `@/${sourceLayer}/utils/Logger`

        // Allow import from own layer's Logger
        if (importPath === expectedPath) return

        // Flag cross-module logger imports
        context.report({
          node,
          messageId: 'wrongLoggerImport',
          data: { expectedLayer: sourceLayer, importPath }
        })
      },
      ExportNamedDeclaration(node) {
        if (!isBarrelIndex) return
        if (!node.source) return

        const hasLoggerExport = node.specifiers.some(
          (s) =>
            s.type === 'ExportSpecifier' &&
            s.exported.type === 'Identifier' &&
            s.exported.name === 'logger'
        )
        if (!hasLoggerExport) return

        context.report({
          node,
          messageId: 'noLoggerBarrelExport'
        })
      },
      ExportAllDeclaration(node) {
        if (!isBarrelIndex) return

        const source = node.source?.value
        if (typeof source !== 'string') return

        // Flag wildcard re-exports from Logger files
        // (which would include the logger instance)
        if (source.endsWith('/Logger') || source.endsWith('/Logger.ts')) {
          context.report({
            node,
            messageId: 'noLoggerBarrelExport'
          })
        }
      }
    }
  }
})
