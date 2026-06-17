import { createRule } from '../utils.js'

export default createRule({
  name: 'core-layer-boundaries',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce layer dependency boundaries in packages/core (shared is root; client/server → shared; lucy → shared, server)',
      recommended: 'error'
    },
    messages: {
      disallowedLayerImport:
        '{{sourceLayer}} must not import from {{targetLayer}}. Allowed cross-layer dependencies: {{allowed}}.',
      deepCrossLayerImport:
        'Cross-layer imports must use the barrel export. Use "@/{{targetLayer}}" instead of "{{importPath}}".'
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

    // Dependency DAG: layer → layers it may import from
    const ALLOWED_IMPORTS = {
      shared: [],
      client: ['shared'],
      server: ['shared'],
      lucy: ['shared', 'server']
    }

    function checkImport(node) {
      const importPath = node.source?.value
      if (typeof importPath !== 'string') return

      // Check both @/ alias and @tribes-terminal/core/ package imports
      let targetLayer = null
      if (importPath.startsWith('@/')) {
        const m = importPath.match(/^@\/(shared|client|server|lucy)(?:\/|$)/)
        if (m) targetLayer = m[1]
      } else if (importPath.startsWith('@tribes-terminal/core/')) {
        const m = importPath.match(
          /^@tribes-terminal\/core\/(shared|client|server|lucy)(?:\/|$)/
        )
        if (m) targetLayer = m[1]
      }
      if (!targetLayer) return

      // Same-layer imports are always allowed at any depth
      if (targetLayer === sourceLayer) return

      // Cross-layer: check DAG
      const allowed = ALLOWED_IMPORTS[sourceLayer]
      if (!allowed.includes(targetLayer)) {
        context.report({
          node,
          messageId: 'disallowedLayerImport',
          data: {
            sourceLayer,
            targetLayer,
            allowed:
              allowed.length > 0
                ? allowed.join(', ')
                : '(none — root layer)'
          }
        })
        return
      }

      // Cross-layer allowed: enforce barrel-only (no deep imports)
      const isBarrelImport =
        importPath === `@/${targetLayer}` ||
        importPath === `@/${targetLayer}/index` ||
        importPath === `@tribes-terminal/core/${targetLayer}`
      if (!isBarrelImport) {
        context.report({
          node,
          messageId: 'deepCrossLayerImport',
          data: { targetLayer, importPath }
        })
      }
    }

    return {
      ImportDeclaration: checkImport,
      ExportAllDeclaration: checkImport,
      ExportNamedDeclaration(node) {
        if (node.source) checkImport(node)
      }
    }
  }
})
