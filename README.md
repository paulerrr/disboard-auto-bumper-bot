# Discord Auto Bumper Bot

An automated bot for bumping Discord servers on listing services (Disboard and Discadia). Based on shroomjaks' project.

## Overview

This bot automates the process of "bumping" your Discord server on listing services to maintain visibility. It supports:

- **Disboard**: Bumps every 2 hours (their minimum allowed interval)
- **Discadia**: Bumps once daily at a configured hour

## Features

- **Multi-Service Support**: Works with both Disboard and Discadia
- **Customizable Scheduling**: Set your preferred bump time for Discadia
- **Independent Channel Configuration**: Different channels for each service
- **Smart Timing**: Avoids rate limits and detection
- **Detailed Logging**: Shows exactly when bumps happen and when the next bump is scheduled

## Requirements

- Node.js (v14 or higher recommended)
- A Discord user account (not a bot account)
- Channel IDs for bumping on each service

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/discord-auto-bumper.git
   cd discord-auto-bumper
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory:
   ```env
   TOKEN=your_discord_user_token_here
   DISBOARD_CHANNELS=1349256969042661458,channel_id_2
   DISCADIA_CHANNELS=1351071414257586177,channel_id_2
   DISCADIA_BUMP_HOUR=9
   ```

4. Start the bot:
   ```bash
   npm start
   ```

## Configuration Options

| Environment Variable | Description | Example |
|---------------------|-------------|---------|
| `TOKEN` | Your Discord user token | `mfa.VkO_2G4Qv3T--NO-lWetW_tjND--TOKEN-QFTm6YGtzq9PH--4U--tG0` |
| `DISBOARD_CHANNELS` | Comma-separated list of channel IDs where Disboard bumps should be sent | `1349256969042661458,12345678987654321` |
| `DISCADIA_CHANNELS` | Comma-separated list of channel IDs where Discadia bumps should be sent | `1351071414257586177,12345678987654321` |
| `DISCADIA_BUMP_HOUR` | Hour to bump Discadia (0-23, server's local time) | `9` for 9:00 AM |

## How It Works

1. The bot logs into Discord using your user token
2. For Disboard:
   - Sends `/bump` command to the Disboard bot every 2+ hours
   - Maintains its own timing to ensure proper intervals
3. For Discadia:
   - Sends `/bump` command once daily at the configured hour
   - Tracks when it last bumped to avoid duplicate bumps

## Important Notes

- Using self-bots (automating a user account) technically violates Discord's Terms of Service
- This bot uses random timing variations to reduce the risk of detection
- For security, never share your `.env` file or token

## Troubleshooting

**Bot doesn't bump:**
- Check your Discord token is correct
- Verify channel IDs are correct
- Ensure the bot has permission to send messages in the channels

**Error messages about invalid configuration:**
- Make sure all environment variables are properly set in the `.env` file

## License

This project is available under the MIT License.

## Acknowledgements

- Original concept by shroomjaks
- Uses discord.js-selfbot-v13 for Discord API interaction