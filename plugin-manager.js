'use strict'

const fs = require('fs')
const path = require('path')

const PLUGIN_DIR = path.join(__dirname, 'plugins')
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.AUTO_UPDATE_TOKEN
const RESERVED_FILES = new Set(['index.js', 'bot.js', 'pair.js', 'drenox.js', 'server.js', 'config.js'])

function ensurePluginDir() {
  fs.mkdirSync(PLUGIN_DIR, { recursive: true })
}

function normalizeRepo(input) {
  let value = String(input || '').trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/, '')
    .replace(/^\/+|\/+$/g, '')
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    throw new Error('Use a GitHub repository like owner/repo')
  }
  return value
}

function safeFileName(value) {
  return value.replace(/[^A-Za-z0-9._-]/g, '_')
}

async function githubJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'HAJII-MD-plugin-manager',
      ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {})
    }
  })
  if (!response.ok) throw new Error(`GitHub API returned ${response.status}`)
  return response.json()
}

async function installGitHubPlugin(input, ref = 'main') {
  const repo = normalizeRepo(input)
  const tree = await githubJson(`https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`)
  const files = (tree.tree || []).filter(item => item.type === 'blob' && item.path.toLowerCase().endsWith('.js'))
  const pluginFiles = files.filter(item => {
    const normalized = item.path.replace(/\\/g, '/')
    const base = path.posix.basename(normalized).toLowerCase()
    return normalized.startsWith('plugins/') || base.startsWith('plugin') || (files.length === 1 && !RESERVED_FILES.has(base))
  })
  if (!pluginFiles.length) throw new Error('No plugin JavaScript file found. Put plugins/*.js or plugin*.js in the repository.')
  if (pluginFiles.length > 20) throw new Error('Repository has too many plugin files (maximum 20).')
  if (pluginFiles.some(file => Number(file.size || 0) > 250_000)) throw new Error('A plugin file exceeds the 250 KB limit.')

  ensurePluginDir()
  const installed = []
  for (const file of pluginFiles) {
    const rawUrl = `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(ref)}/${file.path.split('/').map(encodeURIComponent).join('/')}`
    const response = await fetch(rawUrl, {
      headers: {
        'User-Agent': 'HAJII-MD-plugin-manager',
        ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {})
      }
    })
    if (!response.ok) throw new Error(`Could not download ${file.path} (${response.status})`)
    const code = await response.text()
    if (!code.trim()) throw new Error(`Plugin file is empty: ${file.path}`)
    const outputName = safeFileName(`${repo.replace('/', '__')}__${file.path.replace(/\//g, '__')}`)
    fs.writeFileSync(path.join(PLUGIN_DIR, outputName), code, 'utf8')
    installed.push(outputName)
  }
  return installed
}

function loadPlugins() {
  ensurePluginDir()
  const registry = new Map()
  for (const file of fs.readdirSync(PLUGIN_DIR).filter(name => name.endsWith('.js'))) {
    const fullPath = path.join(PLUGIN_DIR, file)
    try {
      delete require.cache[require.resolve(fullPath)]
      const plugin = require(fullPath)
      const commands = plugin?.commands || plugin?.default?.commands
      if (!commands || typeof commands !== 'object') continue
      for (const [name, handler] of Object.entries(commands)) {
        if (typeof handler !== 'function') continue
        registry.set(String(name).toLowerCase(), handler)
      }
    } catch (error) {
      console.error(`Plugin load failed (${file}): ${error.message}`)
    }
  }
  return registry
}

function getPluginCommand(command) {
  return loadPlugins().get(String(command || '').toLowerCase())
}

function listPlugins() {
  ensurePluginDir()
  return fs.readdirSync(PLUGIN_DIR).filter(name => name.endsWith('.js'))
}

function removePlugin(name) {
  ensurePluginDir()
  const safeName = path.basename(String(name || ''))
  if (!safeName.endsWith('.js') || safeName !== name) throw new Error('Provide the exact .js filename from plugin list.')
  const target = path.join(PLUGIN_DIR, safeName)
  if (!fs.existsSync(target)) throw new Error('Plugin file not found.')
  fs.unlinkSync(target)
  return safeName
}

module.exports = {
  installGitHubPlugin,
  getPluginCommand,
  listPlugins,
  removePlugin,
  PLUGIN_DIR
}
