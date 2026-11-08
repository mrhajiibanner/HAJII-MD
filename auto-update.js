'use strict'

const fs = require('fs')
const path = require('path')
const https = require('https')
const { execFile } = require('child_process')

const ROOT = __dirname
const DEFAULT_REPO = 'mrhajiibanner/HAJII-MD'
const BRANCH = process.env.AUTO_UPDATE_BRANCH || 'main'
const REPO = process.env.AUTO_UPDATE_REPO || DEFAULT_REPO
const TOKEN = process.env.AUTO_UPDATE_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN
const INTERVAL_MS = Math.max(60_000, Number(process.env.AUTO_UPDATE_INTERVAL_MS || 300_000))

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

function getRemoteSha() {
  return new Promise((resolve, reject) => {
    const request = https.get({
      hostname: 'api.github.com',
      path: `/repos/${REPO}/commits/${encodeURIComponent(BRANCH)}`,
      headers: {
        'User-Agent': 'HAJII-MD-auto-updater',
        Accept: 'application/vnd.github+json',
        ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {})
      },
      timeout: 15_000
    }, response => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', chunk => { body += chunk })
      response.on('end', () => {
        if (response.statusCode !== 200) {
          return reject(new Error(`GitHub API returned ${response.statusCode}`))
        }
        try {
          const payload = JSON.parse(body)
          if (!payload.sha) throw new Error('GitHub response did not contain a commit SHA')
          resolve(payload.sha)
        } catch (error) {
          reject(error)
        }
      })
    })
    request.on('timeout', () => request.destroy(new Error('GitHub API timeout')))
    request.on('error', reject)
  })
}

async function checkForUpdate() {
  if (running) return
  running = true
  try {
    const localSha = await runGit(['rev-parse', 'HEAD'])
    const remoteSha = await getRemoteSha()
    if (!remoteSha || remoteSha === localSha) return

    console.log(`🔄 New HAJII-MD update found: ${remoteSha.slice(0, 8)}`)
    const authHeader = `Authorization: Bearer ${TOKEN}`
    await runGit(['-c', `http.extraHeader=${authHeader}`, 'fetch', '--no-tags', 'origin', BRANCH])
    await runGit(['reset', '--hard', `origin/${BRANCH}`])
    console.log('✅ Update installed. Restarting so all connected bots load the new code...')
    process.exit(0)
  } catch (error) {
    console.log(`⚠️ Auto-update check skipped: ${error.message}`)
  } finally {
    running = false
  }
}

function startAutoUpdate() {
  if (!fs.existsSync(path.join(ROOT, '.git'))) {
    console.log('ℹ️ Auto-update disabled: this deployment is not a Git checkout.')
    return
  }
  if (!TOKEN) {
    console.log('ℹ️ Auto-update disabled: set AUTO_UPDATE_TOKEN or GITHUB_TOKEN for the private repository.')
    return
  }
  console.log(`🔁 Auto-update enabled: checking ${REPO}@${BRANCH} every ${Math.round(INTERVAL_MS / 1000)}s`)
  checkForUpdate()
  timer = setInterval(checkForUpdate, INTERVAL_MS)
  timer.unref?.()
}

module.exports = { startAutoUpdate, checkForUpdate }
