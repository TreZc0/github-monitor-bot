# github-monitor-bot

A Discord bot that monitors GitHub repositories and sends notifications to Discord channels when new releases or tags are published.

## Features

- Monitor multiple GitHub repositories
- Automatic notifications for new releases and tags
- Polls repositories every 30 minutes
- Support for both public and private repos (with GitHub token)

## Setup

1. Create a `tokens.json` file in the root directory:
```json
{
  "DISCORD_TOKEN": "your-discord-bot-token",
  "GITHUB_TOKEN": "your-github-token-optional"
}
```

2. Install dependencies:
```bash
npm install
```

3. Run the bot:
```bash
node index.js
```

## Commands

- `/addrepo <repo>` - Start monitoring a GitHub repository
  - Accepts: `owner/repo`, `https://github.com/owner/repo`, or `github.com/owner/repo`

- `/removerepo <repo>` - Stop monitoring a GitHub repository
  - Accepts: `owner/repo`, `https://github.com/owner/repo`, or `github.com/owner/repo`

- `/setchannel` - Set the current channel to receive notifications

## How it works

The bot checks monitored repositories every 30 minutes for:
- New releases (highest priority)
- New tags (if no release)

When a new release or tag is detected, all configured channels receive a notification with a link to the release.