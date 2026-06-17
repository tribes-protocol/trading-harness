// ESM ESLint plugin providing custom rules for the Lucy monorepo
import noBigNumberToString from './rules/no-bignumber-to-string.js'
import noJsonStringify from './rules/no-json-stringify.js'
import noRawNullCheck from './rules/no-raw-null-check.js'
import noPassThroughAliasExport from './rules/no-pass-through-alias-export.js'
import noOptionalNullable from './rules/no-optional-nullable.js'
import noBarrelReExport from './rules/no-barrel-re-export.js'
import noGenericFilenames from './rules/no-generic-filenames.js'
import enforceWebClientServiceSuffix from './rules/enforce-web-client-service-suffix.js'
import noFetchOutsideScopedHelpers from './rules/no-fetch-outside-scoped-helpers.js'
import lucyHelpersMustBeClassBased from './rules/lucy-helpers-must-be-class-based.js'
import noDirectDoNamespaceAccess from './rules/no-direct-do-namespace-access.js'
import noControllerInstantiationOutsideHelperCloudflare from './rules/no-controller-instantiation-outside-helper-cloudflare.js'
import noIndexedTypeAccess from './rules/no-indexed-type-access.js'
import noInlineDoName from './rules/no-inline-do-name.js'
import noConsoleUsage from './rules/no-console-usage.js'
import noInlineZodInfer from './rules/no-inline-zod-infer.js'
import coreLayerBoundaries from './rules/core-layer-boundaries.js'
import noCrossModuleLogger from './rules/no-cross-module-logger.js'
import noProcessEnv from './rules/no-process-env.js'
import noAsyncInUtils from './rules/no-async-in-utils.js'
import noDefaultInEnumSwitch from './rules/no-default-in-enum-switch.js'
import preferSwitchForEnum from './rules/prefer-switch-for-enum.js'
import enforceHandleAction from './rules/enforce-handle-action.js'
import noRawZodBigint from './rules/no-raw-zod-bigint.js'
import noServiceImportInHelpers from './rules/no-service-import-in-helpers.js'
import requireEslintDisableExplanation from './rules/require-eslint-disable-explanation.js'
import noDeadAddressLiteral from './rules/no-dead-address-literal.js'
import enforceResolvedApiUrl from './rules/enforce-resolved-api-url.js'
import enforceUrlConstructorTwoArgs from './rules/enforce-url-constructor-two-args.js'
import noExportedTypeOutsideTypesDir from './rules/no-exported-type-outside-types-dir.js'
import noEmptyFile from './rules/no-empty-file.js'
import enforceAsJsonResponse from './rules/enforce-as-json-response.js'
import noResponseReturnInServices from './rules/no-response-return-in-services.js'
import enforceLucyServicesNaming from './rules/enforce-lucy-services-naming.js'
import enforceTestFileLocation from './rules/enforce-test-file-location.js'
import enforceTestImportAlias from './rules/enforce-test-import-alias.js'
import enforceBigNumberDefaultImport from './rules/enforce-bignumber-default-import.js'
import exactPackageJsonDependencyVersions from './rules/exact-package-json-dependency-versions.js'
import noV8Ignore from './rules/no-v8-ignore.js'
import noNodeEnvDefault from './rules/no-node-env-default.js'
import enforceDoExtendsAbstract from './rules/enforce-do-extends-abstract.js'
import noUsePrivyAuthSession from './rules/no-use-privy-auth-session.js'

export default {
  rules: {
    'no-bignumber-to-string': noBigNumberToString,
    'no-json-stringify': noJsonStringify,
    'no-raw-null-check': noRawNullCheck,
    'no-pass-through-alias-export': noPassThroughAliasExport,
    'no-optional-nullable': noOptionalNullable,
    'no-barrel-re-export': noBarrelReExport,
    'no-generic-filenames': noGenericFilenames,
    'enforce-web-client-service-suffix': enforceWebClientServiceSuffix,
    'no-fetch-outside-scoped-helpers': noFetchOutsideScopedHelpers,
    'lucy-helpers-must-be-class-based': lucyHelpersMustBeClassBased,
    'no-direct-do-namespace-access': noDirectDoNamespaceAccess,
    'no-controller-instantiation-outside-helper-cloudflare':
      noControllerInstantiationOutsideHelperCloudflare,
    'no-indexed-type-access': noIndexedTypeAccess,
    'no-inline-do-name': noInlineDoName,
    'no-console-usage': noConsoleUsage,
    'no-inline-zod-infer': noInlineZodInfer,
    'core-layer-boundaries': coreLayerBoundaries,
    'no-cross-module-logger': noCrossModuleLogger,
    'no-process-env': noProcessEnv,
    'no-async-in-utils': noAsyncInUtils,
    'no-default-in-enum-switch': noDefaultInEnumSwitch,
    'prefer-switch-for-enum': preferSwitchForEnum,
    'enforce-handle-action': enforceHandleAction,
    'no-raw-zod-bigint': noRawZodBigint,
    'no-service-import-in-helpers': noServiceImportInHelpers,
    'require-eslint-disable-explanation': requireEslintDisableExplanation,
    'no-dead-address-literal': noDeadAddressLiteral,
    'enforce-resolved-api-url': enforceResolvedApiUrl,
    'enforce-url-constructor-two-args': enforceUrlConstructorTwoArgs,
    'no-exported-type-outside-types-dir': noExportedTypeOutsideTypesDir,
    'no-empty-file': noEmptyFile,
    'enforce-as-json-response': enforceAsJsonResponse,
    'no-response-return-in-services': noResponseReturnInServices,
    'enforce-lucy-services-naming': enforceLucyServicesNaming,
    'enforce-test-file-location': enforceTestFileLocation,
    'enforce-test-import-alias': enforceTestImportAlias,
    'enforce-bignumber-default-import': enforceBigNumberDefaultImport,
    'exact-package-json-dependency-versions': exactPackageJsonDependencyVersions,
    'no-v8-ignore': noV8Ignore,
    'no-node-env-default': noNodeEnvDefault,
    'enforce-do-extends-abstract': enforceDoExtendsAbstract,
    'no-use-privy-auth-session': noUsePrivyAuthSession
  }
}
