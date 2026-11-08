# HAJII-MD automatic updates

The process checks the private `mrhajiibanner/HAJII-MD` repository for new commits and restarts itself when a new commit is available. Restarting the main process reconnects all paired bots and loads the updated commands.

Set the following environment variable in the hosting panel (never commit the token to the repository):

```text
AUTO_UPDATE_TOKEN=<a GitHub fine-grained token with Contents: Read-only access to mrhajiibanner/HAJII-MD>
```

Optional variables:

```text
AUTO_UPDATE_REPO=mrhajiibanner/HAJII-MD
AUTO_UPDATE_BRANCH=main
AUTO_UPDATE_INTERVAL_MS=300000
```

The updater is intentionally disabled when the deployment has no `.git` directory or no token. It uses `git reset --hard origin/main` only for tracked source files; pairing sessions and runtime settings remain untracked and are not removed.

After changing code or configuration, push the commit to `main`. Each connected-bot process will detect it on its next check, update, restart, and auto-load its saved pairings.
