#!/bin/bash

# Discord Music Bot Update Script
# Safely updates the bot with backup

BOT_DIR="/home/musicbot/discord-music-bot"
SERVICE_NAME="musicbot"
BACKUP_BEFORE_UPDATE=true

echo "🔄 Starting Discord Music Bot Update"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run as root or with sudo"
    exit 1
fi

# Check if service exists
if ! systemctl is-active --quiet $SERVICE_NAME; then
    echo "⚠️  Warning: Service $SERVICE_NAME is not running"
fi

# Create backup before update
if [ "$BACKUP_BEFORE_UPDATE" = true ]; then
    echo "📦 Creating backup before update..."
    sudo -u musicbot $BOT_DIR/scripts/backup.sh
    if [ $? -eq 0 ]; then
        echo "✅ Backup created successfully"
    else
        echo "❌ Backup failed, aborting update"
        exit 1
    fi
fi

# Stop the service
echo "⏹️  Stopping $SERVICE_NAME service..."
systemctl stop $SERVICE_NAME

# Wait for service to stop
sleep 3

# Check if service stopped
if systemctl is-active --quiet $SERVICE_NAME; then
    echo "❌ Failed to stop service"
    exit 1
fi

echo "✅ Service stopped"

# Change to bot directory
cd $BOT_DIR || exit 1

# Create update branch if using git
if [ -d ".git" ]; then
    echo "📥 Pulling latest changes..."
    sudo -u musicbot git stash
    sudo -u musicbot git pull origin main
    sudo -u musicbot git stash pop || true
else
    echo "⚠️  Not a git repository, skipping git update"
fi

# Update dependencies
echo "📦 Updating npm dependencies..."
sudo -u musicbot npm ci --only=production

# Fix permissions
echo "🔐 Fixing permissions..."
chown -R musicbot:musicbot $BOT_DIR
chmod -R 755 $BOT_DIR
chmod 600 $BOT_DIR/.env 2>/dev/null || true

# Start the service
echo "▶️  Starting $SERVICE_NAME service..."
systemctl start $SERVICE_NAME

# Wait for service to start
sleep 5

# Check if service started
if systemctl is-active --quiet $SERVICE_NAME; then
    echo "✅ Service started successfully"
else
    echo "❌ Service failed to start"
    echo "📋 Checking service logs:"
    journalctl -u $SERVICE_NAME -n 50 --no-pager
    exit 1
fi

# Show service status
echo "📊 Service status:"
systemctl status $SERVICE_NAME --no-pager -l

echo "✅ Update completed successfully!"
echo ""
echo "🔍 Useful commands:"
echo "  View logs: journalctl -u $SERVICE_NAME -f"
echo "  Restart: systemctl restart $SERVICE_NAME"
echo "  Stop: systemctl stop $SERVICE_NAME"