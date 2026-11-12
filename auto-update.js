'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const https = require('https')
const { execFile, execFileSync } = require('child_process')

const ROOT = __dirname
const DEFAULT_REPO = 'mrhajiibanner/HAJII-MD'
const BRANCH = process.env.AUTO_UPDATE_BRANCH || 'main'
const REPO = process.env.AUTO_UPDATE_REPO || DEFAULT_REPO

function tokenFromGitRemote() {
  try {
    const remote = execFileSync('git', ['config', '--get', 'remote.origin.url'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
    if (!remote.startsWith('http://') && !remote.startsWith('https://')) return ''
    const parsed = new URL(remote)
    // Deployments may store the token as the password in
    // https://x-access-token:TOKEN@github.com/... or as the username in
    // https://TOKEN@github.com/.... Support both without writing it to source.
    if (parsed.password) return decodeURIComponent(parsed.password)
    if (parsed.username && parsed.username !== 'x-access-token') return decodeURIComponent(parsed.username)
    return ''
  } catch {
    return ''
  }
}

// Environment variables are preferred. Authenticated git clones are supported
// as a secure deployment fallback without placing a token in source code.
const TOKEN = process.env.AUTO_UPDATE_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || tokenFromGitRemote()
const INTERVAL_MS = Math.max(60_000, Number(process.env.AUTO_UPDATE_INTERVAL_MS || 120_000))
const RESTART_AFTER_UPDATE = process.env.AUTO_UPDATE_RESTART === 'true'
const STATE_FILE = path.join(ROOT, '.hajii-update-sha')

let running = false
let timer

function runGit(args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: ROOT, timeout: 60_000 }, (error, stdout, stderr) => {
      if (error) return reject(new Error((stderr || error.message).trim()))
      resolve(stdout.trim())
    })
  })
}

function request(url, headers = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many GitHub redirects'))
    const target = new URL(url)
    const req = https.get({
      hostname: target.hostname,
      path: `${target.pathname}${target.search}`,
      headers: { 'User-Agent': 'HAJII-MD-auto-updater', ...headers },
      timeout: 20_000
    }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        return resolve(request(new URL(response.headers.location, target).toString(), headers, redirects + 1))
      }
      let body = ''
      response.setEncoding('utf8')
      response.on('data', chunk => { body += chunk })
      response.on('end', () => resolve({ statusCode: response.statusCode, headers: response.headers, body }))
    })
    req.on('timeout', () => req.destroy(new Error('GitHub request timeout')))
    req.on('error', reject)
  })
}

function getRemoteSha() {
  return request(`https://api.github.com/repos/${REPO}/commits/${encodeURIComponent(BRANCH)}`, {
    Accept: 'application/vnd.github+json',
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {})
  }).then(response => {
    if (response.statusCode !== 200) throw new Error(`GitHub API returned ${response.statusCode}`)
    const payload = JSON.parse(response.body)
    if (!payload.sha) throw new Error('GitHub response did not contain a commit SHA')
    return payload.sha
  })
}

function downloadArchive(destination) {
  return request(`https://api.github.com/repos/${REPO}/tarball/${encodeURIComponent(BRANCH)}`, {
    Accept: 'application/vnd.github+json',
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {})
  }).then(response => {
    if (response.statusCode !== 200) throw new Error(`GitHub archive returned ${response.statusCode}`)
    // request() stores text, so preserve binary bytes by downloading again through a file stream.
    return new Promise((resolve, reject) => {
      const target = new URL(`https://api.github.com/repos/${REPO}/tarball/${encodeURIComponent(BRANCH)}`)
      const headers = {
        'User-Agent': 'HAJII-MD-auto-updater',
        Accept: 'application/vnd.github+json',
        ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {})
      }
      const fetchFile = (url, redirects = 0) => {
        if (redirects > 5) return reject(new Error('Too many archive redirects'))
        const u = new URL(url)
        const req = https.get({ hostname: u.hostname, path: `${u.pathname}${u.search}`, headers, timeout: 60_000 }, res => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume()
            return fetchFile(new URL(res.headers.location, u).toString(), redirects + 1)
          }
          if (res.statusCode !== 200) {
            res.resume()
            return reject(new Error(`Archive download returned ${res.statusCode}`))
          }
          const output = fs.createWriteStream(destination)
          res.pipe(output)
          output.on('finish', () => output.close(resolve))
          output.on('error', reject)
        })
        req.on('timeout', () => req.destroy(new Error('Archive download timeout')))
        req.on('error', reject)
      }
      fetchFile(target.toString())
    })
  })
}

function copySourceTree(source, destination, relative = '', changedFiles = []) {
  const ignored = new Set([
    '.git', 'node_modules', '.hajii-update-sha', 'setting.json', 'auth.json',
    'database', 'tmp', 'sticker', 'kingbadboitimewisher'
  ])
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue
    const rel = relative ? path.join(relative, entry.name) : entry.name
    const from = path.join(source, entry.name)
    const to = path.join(destination, entry.name)
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true })
      copySourceTree(from, to, rel, changedFiles)
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(to), { recursive: true })
      fs.copyFileSync(from, to)
      changedFiles.push(rel.split(path.sep).join('/'))
    }
  }
}

async function applyArchiveUpdate(remoteSha) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hajii-update-'))
  const archive = path.join(tempDir, 'source.tar.gz')
  const extracted = path.join(tempDir, 'source')
  try {
    fs.mkdirSync(extracted)
    await downloadArchive(archive)
    await new Promise((resolve, reject) => {
      execFile('tar', ['-xzf', archive, '-C', extracted, '--strip-components=1'], { timeout: 120_000 }, error => error ? reject(error) : resolve())
    })
    const changedFiles = []
    copySourceTree(extracted, ROOT, '', changedFiles)
    fs.writeFileSync(STATE_FILE, `${remoteSha}\n`)
    return changedFiles
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

async function checkForUpdate() {
  if (running) return
  running = true
  try {
    const remoteSha = await getRemoteSha()
    const hasGit = fs.existsSync(path.join(ROOT, '.git'))
    let localSha = ''
    if (hasGit) {
      localSha = await runGit(['rev-parse', 'HEAD'])
    } else if (fs.existsSync(STATE_FILE)) {
      localSha = fs.readFileSync(STATE_FILE, 'utf8').trim()
    }
    if (!remoteSha || remoteSha === localSha) return

    console.log(`🔄 New HAJII-MD update found: ${remoteSha.slice(0, 8)}`)
    // Notify first, but never let WhatsApp notification failure block the update.
    if (typeof global.hajiiNotifyUpdateAvailable === 'function') {
      try {
        await Promise.race([
          Promise.resolve(global.hajiiNotifyUpdateAvailable(remoteSha)),
          new Promise(resolve => setTimeout(resolve, 8000))
        ])
      } catch (notifyError) {
        console.log(`⚠️ Update-available notification skipped: ${notifyError.message}`)
      }
    }
    let changedFiles = []
    if (hasGit) {
      const fetchArgs = ['fetch', '--no-tags', 'origin', BRANCH]
      if (TOKEN) fetchArgs.unshift('-c', `http.extraHeader=Authorization: Bearer ${TOKEN}`)
      await runGit(fetchArgs)
      changedFiles = (await runGit(['diff', '--name-only', 'HEAD', `origin/${BRANCH}`]))
        .split('\n').map(file => file.trim()).filter(Boolean)
      await runGit(['reset', '--hard', `origin/${BRANCH}`])
      fs.writeFileSync(STATE_FILE, `${remoteSha}\n`)
    } else {
      changedFiles = await applyArchiveUpdate(remoteSha)
    }

    if (typeof global.hajiiReloadCommandHandler === 'function') {
      try {
        await global.hajiiReloadCommandHandler()
      } catch (reloadError) {
        console.log(`⚠️ Live command reload skipped: ${reloadError.message}`)
      }
    }

    if (typeof global.hajiiNotifyUpdate === 'function') {
      try {
        await Promise.race([
          Promise.resolve(global.hajiiNotifyUpdate(changedFiles, remoteSha)),
          new Promise(resolve => setTimeout(resolve, 8000))
        ])
      } catch (notifyError) {
        console.log(`⚠️ Update confirmation notification skipped: ${notifyError.message}`)
      }
    }

    if (RESTART_AFTER_UPDATE) {
      console.log('✅ Update installed. Restarting because AUTO_UPDATE_RESTART=true...')
      process.exit(0)
    }
    console.log('✅ Update installed live. Connected bots remain online; command watchers will reload the new code.')
  } catch (error) {
    console.log(`⚠️ Auto-update check skipped: ${error.message}`)
  } finally {
    running = false
  }
}

function startAutoUpdate() {
  console.log(`🔁 Auto-update enabled: checking ${REPO}@${BRANCH} every ${Math.round(INTERVAL_MS / 1000)}s${TOKEN ? ' (authenticated)' : ' (unauthenticated)'}`)
  if (!TOKEN) console.log('⚠️ No GitHub token found. Private repository checks will return 404; set AUTO_UPDATE_TOKEN in Railway Variables.')
  checkForUpdate()
  timer = setInterval(checkForUpdate, INTERVAL_MS)
  timer.unref?.()
}

global.hajiiCheckForUpdate = checkForUpdate
module.exports = { startAutoUpdate, checkForUpdate }
