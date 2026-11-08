# HAJII-MD plugins

Plugin management is owner-only. Plugins are downloaded from GitHub repositories and loaded from `plugins/` without running `npm install` or arbitrary shell commands.

## Commands

```text
.plugin install owner/repo [branch]
.plugin list
.plugin remove filename.js
```

Aliases:

```text
.plugins install owner/repo
.addplugin install owner/repo
.gitadd install owner/repo
```

A repository must contain `plugins/*.js`, `plugin*.js`, or one JavaScript plugin file at its root. Each file is limited to 250 KB and a repository may provide at most 20 plugin files.

## Plugin format

```js
module.exports = {
  name: 'hello-plugin',
  commands: {
    hello: async ({ reply, text }) => {
      await reply(`Hello from the plugin: ${text || 'world'}`)
    }
  }
}
```

The handler receives `bad`, `m`, `store`, `reply`, `text`, `q`, `args`, `prefix`, `command`, `from`, `sender`, `botNumber`, and admin/owner flags. Plugins are loaded on demand, so installing or removing one does not require re-pairing WhatsApp.

Only install repositories you trust: a JavaScript plugin can access the bot process while it is loaded. Keep `GITHUB_TOKEN`/`AUTO_UPDATE_TOKEN` in environment variables and never commit tokens to a plugin repository.
