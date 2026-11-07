import type { UserConfig } from '@commitlint/types';

const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'no-co-authored-by': ({ raw }) => {
          const found = /co-authored-by:/i.test(raw ?? '');
          return [!found, 'a mensagem não pode conter linha Co-authored-by:'];
        },
      },
    },
  ],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
      ],
    ],
    'scope-enum': [
      2,
      'always',
      [
        'overlay',
        'quiz',
        'history',
        'settings',
        'capture',
        'extension',
        'pipeline',
        'ai',
        'db',
        'core',
        'contracts',
        'native',
        'deps',
      ],
    ],
    'header-max-length': [2, 'always', 72],
    'no-co-authored-by': [2, 'always'],
  },
};

export default config;
