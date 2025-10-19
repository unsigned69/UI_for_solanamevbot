import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const config = compat.config({ extends: ['./.eslintrc.js'] });
config.unshift({ ignores: ['.next', 'node_modules', 'out', 'coverage'] });

export default config;
