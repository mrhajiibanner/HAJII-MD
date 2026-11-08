# HAJII-MD automatic updates

The process checks the private `mrhajiibanner/HAJII-MD` repository for new commits. It works both from a Git checkout and from hosts such as Railway that remove the `.git` directory: non-Git deployments download the GitHub source archive and apply source files in place. When a new commit is found, the command handler is reloaded in-place, so all already-connected bots receive the new commands without pairing again.

Set the following environment variable in the hosting panel (never commit the token to the repository):

```text
AUTO_UPDATE_TOKEN=<a GitHub fine-grained token with Contents: Read-only access to mrhajiibanner/HAJII-MD>
```

Optional variables:

```text
AUTO_UPDATE_REPO=mrhajiibanner/HAJII-MD
AUTO_UPDATE_BRANCH=main
AUTO_UPDATE_INTERVAL_MS=300000
# Only set this if a full process restart is specifically required.
AUTO_UPDATE_RESTART=false
```

The updater is intentionally disabled when the deployment has no `.git` directory or no token. It uses `git reset --hard origin/main` only for tracked source files; pairing sessions and runtime settings remain untracked and are not removed.

After changing code or configuration, push the commit to `main`. Each connected-bot process will detect it on its next check and live-reload `drenox.js` while keeping all WhatsApp sockets connected. `AUTO_UPDATE_RESTART=true` is available as a fallback for deployments that require a full restart, but it may temporarily disconnect sockets.
