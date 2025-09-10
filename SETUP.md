# Discord Music Bot - Ubuntu Server Setup Guide

## Prerequisites

- Ubuntu Server 18.04 or later
- Discord Bot Token and Client ID
- Server with at least 1GB RAM and 1 CPU core

## Step 1: Server Preparation

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 18.x (LTS)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version

# Install FFmpeg (required for audio processing)
sudo apt install ffmpeg -y

# Verify FFmpeg
ffmpeg -version
```

## Step 2: Upload Bot Files

```bash
# Create bot directory
sudo mkdir -p /opt/discord-music-bot
sudo chown $USER:$USER /opt/discord-music-bot

# Copy your project files to the server
# Method 1: Using scp (from your local machine)
scp -r ./discord-music/* user@your-server:/opt/discord-music-bot/

# Method 2: Using git (if you have a repository)
cd /opt/discord-music-bot
git clone https://github.com/yourusername/discord-music.git .

# Navigate to bot directory
cd /opt/discord-music-bot

# Install dependencies
npm install
```

## Step 3: Configure Your Bot

### Option A: Using config.json
```bash
# Edit config.json
nano config.json
```

```json
{
  "token": "YOUR_DISCORD_BOT_TOKEN_HERE",
  "clientId": "YOUR_BOT_CLIENT_ID_HERE",
  "prefix": "!",
  "defaultVolume": 70,
  "maxVolume": 200,
  "autoLeave": true,
  "autoLeaveTimeout": 300000,
  "stayInChannel": false
}
```

### Option B: Using Environment Variables
```bash
# Create .env file
cp .env.example .env
nano .env
```

Edit the `.env` file with your actual values:
```
DISCORD_TOKEN=your_actual_bot_token
DISCORD_CLIENT_ID=your_actual_client_id
```

## Step 4: Deploy Discord Commands

```bash
# Deploy slash commands to Discord
node deploy-commands.js
```

## Step 5: Test the Bot

```bash
# Test the bot manually
node index.js
```

If everything works, you should see:
```
Logged in as YourBot#1234!
Commands registered successfully!
```

Press `Ctrl+C` to stop the bot.

## Step 6: Set Up as System Service

```bash
# Create systemd service file
sudo nano /etc/systemd/system/discord-music-bot.service
```

Add this content:
```ini
[Unit]
Description=Discord Music Bot
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/opt/discord-music-bot
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Replace `your-username` with your actual username.

## Step 7: Enable and Start Service

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable discord-music-bot

# Start the service
sudo systemctl start discord-music-bot

# Check service status
sudo systemctl status discord-music-bot

# View logs
sudo journalctl -u discord-music-bot -f
```

## Step 8: Firewall Configuration

```bash
# Allow necessary ports
sudo ufw allow 22      # SSH
sudo ufw allow 80      # HTTP (if you add web interface)
sudo ufw allow 443     # HTTPS (if you add web interface)

# Enable firewall
sudo ufw enable
```

## Service Management Commands

```bash
# View bot logs in real-time
sudo journalctl -u discord-music-bot -f

# Restart the bot
sudo systemctl restart discord-music-bot

# Stop the bot
sudo systemctl stop discord-music-bot

# Check if bot is running
sudo systemctl is-active discord-music-bot

# Update bot code
cd /opt/discord-music-bot
git pull  # if using git
npm install
sudo systemctl restart discord-music-bot
```

## Troubleshooting

### Bot won't start:
```bash
# Check logs
sudo journalctl -u discord-music-bot -n 50

# Check Node.js version
node --version

# Test manually
cd /opt/discord-music-bot
node index.js
```

### Audio issues:
```bash
# Verify FFmpeg
ffmpeg -version

# Check voice connection permissions in Discord
```

### Memory issues:
```bash
# Monitor memory usage
htop
free -h
```

### Permission issues:
```bash
# Check file permissions
ls -la /opt/discord-music-bot

# Fix permissions
sudo chown -R your-username:your-username /opt/discord-music-bot
sudo chmod 600 /opt/discord-music-bot/config.json
```

## Security Best Practices

1. **Use a dedicated user** for running the bot:
   ```bash
   sudo useradd -r -s /bin/false discord-bot
   sudo chown -R discord-bot:discord-bot /opt/discord-music-bot
   ```

2. **Set proper permissions**:
   ```bash
   sudo chmod 600 /opt/discord-music-bot/config.json
   sudo chmod 600 /opt/discord-music-bot/.env
   ```

3. **Regular updates**:
   ```bash
   sudo apt update && sudo apt upgrade -y
   npm update
   ```

4. **Monitor logs**:
   ```bash
   sudo journalctl -u discord-music-bot -f
   ```

## Advanced Setup (Optional)

### Update Script
Create `/opt/discord-music-bot/update.sh`:
```bash
#!/bin/bash
echo "Updating Discord Music Bot..."

# Pull latest changes
git pull origin main

# Install/update dependencies
npm install

# Deploy commands
node deploy-commands.js

# Restart service
sudo systemctl restart discord-music-bot

echo "Update completed!"
```

Make it executable:
```bash
chmod +x /opt/discord-music-bot/update.sh
```

### Backup Script
Create `/opt/discord-music-bot/backup.sh`:
```bash
#!/bin/bash
BACKUP_DIR="/opt/discord-music-bot/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Backup playlists
cp -r playlists $BACKUP_DIR/playlists_$DATE

# Backup config
cp config.json $BACKUP_DIR/config_$DATE.json

# Keep only last 7 backups
find $BACKUP_DIR -name "*.json" -mtime +7 -delete
find $BACKUP_DIR -name "playlists_*" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR"
```

## Discord Bot Setup (if not already done)

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" tab and create a bot
4. Copy the token and client ID
5. Enable privileged intents:
   - Server Members Intent
   - Message Content Intent
6. Go to "OAuth2" → "URL Generator"
7. Select scopes: `bot`, `applications.commands`
8. Select bot permissions:
   - Connect
   - Speak
   - Send Messages
   - Embed Links
   - Read Message History
   - Use External Emojis
   - Add Reactions
9. Invite the bot to your server using the generated URL

## Support

If you encounter any issues:
1. Check the logs: `sudo journalctl -u discord-music-bot -f`
2. Verify your Discord bot configuration
3. Ensure all dependencies are installed
4. Check Discord API status

Your Discord music bot should now be running as a service on your Ubuntu server!