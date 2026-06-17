import { createRule } from '../utils.js'

// Enforces naming convention on ILucyServices interface:
// - Each property type annotation must match I<Name>Service
// - Each property name must be the camelCase form of <Name> (without Service suffix)
// Example: token: ITokenService, news: INewsService, userScheduledJob: IUserScheduledJobService
export default createRule({
  name: 'enforce-lucy-services-naming',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Properties in ILucyServices must use I<Name>Service type annotations and matching camelCase property names',
      recommended: 'error'
    },
    messages: {
      badTypeName:
        'Property "{{ prop }}" in ILucyServices has type "{{ type }}" which does not match the I<Name>Service pattern.',
      badPropName:
        'Property "{{ prop }}" in ILucyServices should be named "{{ expected }}" to match its type "{{ type }}".'
    },
    schema: []
  },
  defaultOptions: [],
  create(context) {
    return {
      TSInterfaceDeclaration(node) {
        if (node.id.name !== 'ILucyServices') return

        for (const member of node.body.body) {
          if (member.type !== 'TSPropertySignature') continue
          if (member.key.type !== 'Identifier') continue

          const propName = member.key.name
          const typeAnnotation = member.typeAnnotation?.typeAnnotation

          if (!typeAnnotation || typeAnnotation.type !== 'TSTypeReference') continue

          const typeName =
            typeAnnotation.typeName.type === 'Identifier' ? typeAnnotation.typeName.name : null

          if (!typeName) continue

          // Check type follows I<Name>Service pattern
          const match = /^I(.+)Service$/.exec(typeName)
          if (!match) {
            context.report({
              node: member,
              messageId: 'badTypeName',
              data: { prop: propName, type: typeName }
            })
            continue
          }

          // Derive expected property name: camelCase of the captured Name
          const name = match[1]
          const expectedProp = name.charAt(0).toLowerCase() + name.slice(1)

          if (propName !== expectedProp) {
            context.report({
              node: member.key,
              messageId: 'badPropName',
              data: { prop: propName, expected: expectedProp, type: typeName }
            })
          }
        }
      }
    }
  }
})
