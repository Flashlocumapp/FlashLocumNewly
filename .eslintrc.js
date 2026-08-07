// https://docs.expo.dev/guides/using-eslint/
module.exports = {
  extends: [
    'expo',
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime'
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react', 'import'],
  root: true,
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    }
  },
  ignorePatterns: ['/dist/*', '/public/*', '/babel-plugins/*', '/backend/*'],
  env: {
    browser: true,
  },
  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: './tsconfig.json',
      },
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
      },
    },
    'import/ignore': [
      // Native-only packages that cannot be resolved in a Node/lint context
      'react-native-maps',
      'react-native-keyboard-controller',
      'expo-notifications',
      'expo-location',
      'expo-document-picker',
      'expo-clipboard',
      'expo-av',
      'use-supercluster',
      'base64-arraybuffer',
      '@expo-google-fonts/inter',
      '@react-native-async-storage/async-storage',
      '@supabase/supabase-js',
    ],
  },
  rules: {
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/prefer-as-const": "off",
    "@typescript-eslint/no-var-requires": "off",
    "react/react-in-jsx-scope": "off",
    "@typescript-eslint/no-empty-object-type": "off",
    "@typescript-eslint/no-wrapper-object-types": "off",
    "@typescript-eslint/ban-tslint-comment": "off",
    "react/no-unescaped-entities": "off",
    "import/no-unresolved": ["error", {
      "ignore": [
        "react-native-maps",
        "react-native-keyboard-controller",
        "expo-notifications",
        "expo-location",
        "expo-document-picker",
        "expo-clipboard",
        "expo-av",
        "use-supercluster",
        "base64-arraybuffer",
        "@expo-google-fonts/.*",
        "@react-native-async-storage/async-storage",
        "@supabase/supabase-js"
      ]
    }],
    "import/namespace": "off",
    "prefer-const": "off",
    "react/prop-types": 1,
    "no-case-declarations": "off",
    "no-empty": "off",
    "react/display-name": "off",
    "no-constant-condition": "off",
    "no-var": "off",
    "no-useless-escape": "off"
  },
  overrides: [
    {
      files: ['metro.config.js'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off'
      }
    },
    {
      // Inline render-prop functions typed via @react-navigation BottomTabBarProps
      // are fully typed in TypeScript — prop-types validation is redundant here.
      files: ['app/(requester)/_layout.ios.tsx', 'app/(requester)/_layout.tsx'],
      rules: {
        'react/prop-types': 'off'
      }
    }
  ]
};
