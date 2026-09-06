import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';
import n from 'eslint-plugin-n';
import jsdoc from 'eslint-plugin-jsdoc';
import prettier from 'eslint-config-prettier';

const tsFiles = ['apps/**/*.{ts,tsx}'];
const nodeFiles = ['apps/live-feed-service/src/**/*.ts'];
const reactFiles = ['apps/client/resources/js/**/*.{ts,tsx}'];
const testFiles = ['apps/**/*.test.{ts,tsx}', 'apps/**/test/**/*.{ts,tsx}'];
const productionDocumentationFiles = ['apps/live-feed-service/src/**/*.ts', 'apps/client/resources/js/**/*.{ts,tsx}'];
const documentationExcludedFiles = [
  'apps/**/*.test.{ts,tsx}',
  'apps/**/test/**/*.{ts,tsx}',
  'apps/client/resources/js/env.d.ts',
];

const typedTypeScriptConfigs = tseslint.configs.recommendedTypeChecked.map((config) => ({
  ...config,
  files: tsFiles,
}));

function hasLeadingJsdoc(sourceCode, node) {
  const comments = sourceCode.getCommentsBefore(node);
  const previousComment = comments.at(-1);

  return Boolean(previousComment?.type === 'Block' && previousComment.value.startsWith('*'));
}

const documentationPlugin = {
  rules: {
    'require-module-jsdoc': {
      meta: {
        type: 'suggestion',
        docs: {
          description: 'Require authored production modules to begin with a JSDoc responsibility block.',
        },
        schema: [],
        messages: {
          missing: 'Production source files must start with a JSDoc block describing the module responsibility.',
        },
      },
      create(context) {
        return {
          Program(node) {
            const sourceCode = context.sourceCode;
            const text = sourceCode.text.replace(/^#!.*(?:\r?\n|$)/u, '').trimStart();

            if (!text.startsWith('/**')) {
              context.report({ node, messageId: 'missing' });
            }
          },
        };
      },
    },
    'require-export-jsdoc': {
      meta: {
        type: 'suggestion',
        docs: {
          description: 'Require exported JS/TS API surfaces to have JSDoc documentation.',
        },
        schema: [],
        messages: {
          missingExport: 'Exported {{kind}} "{{name}}" must have a JSDoc summary.',
          missingMethod: 'Public method "{{name}}" on exported class "{{className}}" must have a JSDoc summary.',
        },
      },
      create(context) {
        const sourceCode = context.sourceCode;

        function declarationName(declaration) {
          return declaration.id?.name ?? '<anonymous>';
        }

        function declarationKind(declaration) {
          if (declaration.type === 'FunctionDeclaration') return 'function';
          if (declaration.type === 'ClassDeclaration') return 'class';
          if (declaration.type === 'TSInterfaceDeclaration') return 'interface';
          if (declaration.type === 'TSTypeAliasDeclaration') return 'type';
          if (declaration.type === 'TSEnumDeclaration') return 'enum';
          if (declaration.type === 'VariableDeclaration') return 'constant';
          return 'declaration';
        }

        function declarationExportName(declaration) {
          if (declaration.type !== 'VariableDeclaration') {
            return declarationName(declaration);
          }

          const exported = declaration.declarations[0];
          return exported?.id?.name ?? '<anonymous>';
        }

        function checkClassMethods(classDeclaration) {
          for (const member of classDeclaration.body.body) {
            if (member.type !== 'MethodDefinition' && member.type !== 'PropertyDefinition') {
              continue;
            }

            if (member.accessibility && member.accessibility !== 'public') {
              continue;
            }

            if (member.kind === 'constructor') {
              continue;
            }

            if (!hasLeadingJsdoc(sourceCode, member)) {
              context.report({
                node: member,
                messageId: 'missingMethod',
                data: {
                  className: declarationName(classDeclaration),
                  name: member.key?.name ?? '<computed>',
                },
              });
            }
          }
        }

        return {
          ExportNamedDeclaration(node) {
            if (!node.declaration) {
              return;
            }

            const declaration = node.declaration;
            if (!hasLeadingJsdoc(sourceCode, node)) {
              context.report({
                node,
                messageId: 'missingExport',
                data: {
                  kind: declarationKind(declaration),
                  name: declarationExportName(declaration),
                },
              });
            }

            if (declaration.type === 'ClassDeclaration') {
              checkClassMethods(declaration);
            }
          },
        };
      },
    },
  },
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      'apps/client/public/build/**',
      'apps/client/vendor/**',
      'apps/client/storage/**',
      'apps/client/bootstrap/cache/**',
      '**/*.d.ts',
      '**/*.config.js',
    ],
  },
  js.configs.recommended,
  ...typedTypeScriptConfigs,
  {
    files: tsFiles,
    languageOptions: {
      parserOptions: {
        project: ['./apps/live-feed-service/tsconfig.eslint.json', './apps/client/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: ['./apps/live-feed-service/tsconfig.eslint.json', './apps/client/tsconfig.json'],
        },
      },
    },
    rules: {
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/require-await': 'error',
      'import/no-duplicates': 'error',
    },
  },
  {
    files: productionDocumentationFiles,
    ignores: documentationExcludedFiles,
    plugins: {
      jsdoc,
      documentation: documentationPlugin,
    },
    settings: {
      jsdoc: {
        mode: 'typescript',
      },
    },
    rules: {
      'documentation/require-module-jsdoc': 'error',
      'documentation/require-export-jsdoc': 'error',
      'jsdoc/check-alignment': 'error',
      'jsdoc/check-indentation': 'error',
      'jsdoc/check-param-names': 'error',
      'jsdoc/check-tag-names': 'error',
      'jsdoc/check-types': 'error',
      'jsdoc/require-description': 'error',
      'jsdoc/valid-types': 'error',
    },
  },
  {
    files: nodeFiles,
    languageOptions: {
      globals: {
        ...globals.nodeBuiltin,
      },
    },
    plugins: {
      n,
    },
    rules: {
      'n/no-deprecated-api': 'error',
      'n/no-missing-import': 'off',
      'n/no-unsupported-features/es-builtins': 'error',
      'n/prefer-node-protocol': 'warn',
    },
  },
  {
    files: reactFiles,
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react/jsx-key': 'error',
      'react/no-unknown-property': 'error',
      'react/self-closing-comp': 'warn',
      'jsx-a11y/anchor-is-valid': 'error',
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-role': 'error',
      'jsx-a11y/label-has-associated-control': 'error',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
    },
  },
  {
    files: testFiles,
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
    },
  },
  prettier,
);
