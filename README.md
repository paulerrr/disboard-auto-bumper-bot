# Discord Auto Bumper Bot

Based on shroomjaks' project.

---

## Setup

1. Run:
   ```bash
   npm install
   ```

2. Create a `.env` file:
   ```env
   TOKEN=your_discord_user_token_here
   DISBOARD_CHANNELS=channel_id_1
   DISCADIA_CHANNELS=channel_id_1
   DISCADIA_BUMP_HOUR=9
   ```

3. Start the bot:
   ```bash
   npm start
   ```

---

## Features

- Bumps Disboard every 2 hours
- Bumps Discadia once daily at specified hour
- Supports multiple channels for each service
- Channels can be in different servers