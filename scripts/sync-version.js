#!/usr/bin/env node

/**
 * Syncs the version from package.json to .claude-plugin/plugin.json.
 * Run automatically via npm version hooks.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const pluginPath = join(root, '.claude-plugin', 'plugin.json');
const plugin = JSON.parse(readFileSync(pluginPath, 'utf-8'));

if (plugin.version !== pkg.version) {
  plugin.version = pkg.version;
  writeFileSync(pluginPath, JSON.stringify(plugin, null, 2) + '\n');
  console.log(`Synced plugin.json version to ${pkg.version}`);
}
