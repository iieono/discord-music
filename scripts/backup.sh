#!/bin/bash

# Discord Music Bot Backup Script
# Creates backups of playlists and logs

BACKUP_DIR="/home/musicbot/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BOT_DIR="/home/musicbot/discord-music-bot"
RETENTION_DAYS=30

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

echo "Starting backup: $DATE"

# Backup playlists
if [ -d "$BOT_DIR/playlists" ]; then
    echo "Backing up playlists..."
    tar -czf "$BACKUP_DIR/playlists_$DATE.tar.gz" -C "$BOT_DIR" playlists 2>/dev/null
    echo "Playlists backed up"
else
    echo "No playlists directory found"
fi

# Backup logs (last 7 days)
if [ -d "$BOT_DIR/logs" ]; then
    echo "Backing up recent logs..."
    find "$BOT_DIR/logs" -name "*.log" -mtime -7 -exec tar -czf "$BACKUP_DIR/logs_$DATE.tar.gz" {} + 2>/dev/null
    echo "Logs backed up"
else
    echo "No logs directory found"
fi

# Backup config file
if [ -f "$BOT_DIR/.env" ]; then
    echo "Backing up configuration..."
    cp "$BOT_DIR/.env" "$BACKUP_DIR/config_$DATE.env"
    chmod 600 "$BACKUP_DIR/config_$DATE.env"
    echo "Configuration backed up"
fi

# Clean old backups
echo "Cleaning backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null
find "$BACKUP_DIR" -name "config_*.env" -mtime +$RETENTION_DAYS -delete 2>/dev/null

# Create backup summary
echo "Backup Summary - $DATE" > "$BACKUP_DIR/backup_$DATE.log"
ls -lah "$BACKUP_DIR"/*_$DATE* 2>/dev/null >> "$BACKUP_DIR/backup_$DATE.log"

echo "Backup completed: $DATE"
echo "Backup log: $BACKUP_DIR/backup_$DATE.log"

# Send notification if webhook is configured
if [ -n "$BACKUP_WEBHOOK" ]; then
    curl -X POST -H "Content-Type: application/json" \
        -d "{\"content\": \"🎵 Backup completed successfully at $(date)\"}" \
        "$BACKUP_WEBHOOK"
fi