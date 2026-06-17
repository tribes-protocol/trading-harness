// ESLint plugin: the custom rules the trading-harness uses (vendored standalone).
import enforceUrlConstructorTwoArgs from './rules/enforce-url-constructor-two-args.js'
import noBarrelReExport from './rules/no-barrel-re-export.js'
import noEmptyFile from './rules/no-empty-file.js'
import noGenericFilenames from './rules/no-generic-filenames.js'
import noIndexedTypeAccess from './rules/no-indexed-type-access.js'
import noInlineZodInfer from './rules/no-inline-zod-infer.js'
import noJsonStringify from './rules/no-json-stringify.js'
import noOptionalNullable from './rules/no-optional-nullable.js'
import noPassThroughAliasExport from './rules/no-pass-through-alias-export.js'
import noRawZodBigint from './rules/no-raw-zod-bigint.js'
import noV8Ignore from './rules/no-v8-ignore.js'
import pascalcaseFilename from './rules/pascalcase-filename.js'
import requireEslintDisableExplanation from './rules/require-eslint-disable-explanation.js'

export default {
  rules: {
    'enforce-url-constructor-two-args': enforceUrlConstructorTwoArgs,
    'no-barrel-re-export': noBarrelReExport,
    'no-empty-file': noEmptyFile,
    'no-generic-filenames': noGenericFilenames,
    'no-indexed-type-access': noIndexedTypeAccess,
    'no-inline-zod-infer': noInlineZodInfer,
    'no-json-stringify': noJsonStringify,
    'no-optional-nullable': noOptionalNullable,
    'no-pass-through-alias-export': noPassThroughAliasExport,
    'no-raw-zod-bigint': noRawZodBigint,
    'no-v8-ignore': noV8Ignore,
    'pascalcase-filename': pascalcaseFilename,
    'require-eslint-disable-explanation': requireEslintDisableExplanation
  }
}
