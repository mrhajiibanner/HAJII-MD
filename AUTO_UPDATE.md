# HAJII-MD automatic updates

The process checks the private `mrhajiibanner/HAJII-MD` repository for new commits. It works both from a Git checkout and from hosts such as Railway that remove the `.git` directory: non-Git deployments download the GitHub source archive and apply source files in place. When a new commit is found, the command handler is reloaded in-place, so all already-connected bots receive the new commands without pairing again.

## Railway setup

Railway dashboard mein **Service → Variables → New Variable** par ye variable add karo. Token ko repository, `Procfile`, ya source file mein paste mat karo:

```text
AUTO_UPDATE_TOKEN=<a GitHub fine-grained token with Contents: Read-only access to mrhajiibanner/HAJII-MD>
```

Variables save karne ke baad Railway mein **Deploy → Redeploy** karo. Ye one-time restart zaroori hai, kyunki pehle se chal raha container naya environment variable khud receive nahi karta.

Optional variables:

```text
AUTO_UPDATE_REPO=mrhajiibanner/HAJII-MD
AUTO_UPDATE_BRANCH=main
AUTO_UPDATE_INTERVAL_MS=300000
# Only set this if a full process restart is specifically required.
AUTO_UPDATE_RESTART=false
```

Railway par `.git` directory na ho tab bhi archive mode use hota hai; token required hai. Startup logs mein ye line honi chahiye:

```text
🔁 Auto-update enabled: checking mrhajiibanner/HAJII-MD@main every 120s
```

Agar ye aaye to variable missing hai:

```text
ℹ️ Auto-update disabled: set AUTO_UPDATE_TOKEN or GITHUB_TOKEN for the private repository.
```

The updater uses `git reset --hard origin/main` only for tracked source files; pairing sessions and runtime settings remain untracked and are not removed.

After changing code or configuration, push the commit to `main`. Each connected-bot process will detect it on its next check and live-reload `drenox.js` while keeping all WhatsApp sockets connected. `AUTO_UPDATE_RESTART=true` is available as a fallback for deployments that require a full restart, but it may temporarily disconnect sockets.
