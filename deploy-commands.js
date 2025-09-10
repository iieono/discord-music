const { REST, Routes } = require('discord.js');
const config = require('./config.json');

const commands = [
    {
        name: 'play',
        description: 'Play a song from YouTube, Spotify, or SoundCloud',
        options: [
            {
                name: 'query',
                type: 3,
                description: 'Song name or URL',
                required: true
            },
            {
                name: 'filter',
                type: 3,
                description: 'Search filter (duration, date, views)',
                required: false,
                choices: [
                    { name: 'Short (< 4 min)', value: 'short' },
                    { name: 'Medium (4-10 min)', value: 'medium' },
                    { name: 'Long (> 10 min)', value: 'long' },
                    { name: 'This week', value: 'week' },
                    { name: 'This month', value: 'month' },
                    { name: 'This year', value: 'year' },
                    { name: 'Most viewed', value: 'views' }
                ]
            }
        ]
    },
    {
        name: 'skip',
        description: 'Skip the current song'
    },
    {
        name: 'voteskip',
        description: 'Vote to skip the current song'
    },
    {
        name: 'queue',
        description: 'Show the current queue'
    },
    {
        name: 'nowplaying',
        description: 'Show the currently playing song'
    },
    {
        name: 'volume',
        description: 'Set the volume (0-200)',
        options: [
            {
                name: 'amount',
                type: 4,
                description: 'Volume amount',
                required: true
            }
        ]
    },
    {
        name: 'pause',
        description: 'Pause the current song'
    },
    {
        name: 'resume',
        description: 'Resume the current song'
    },
    {
        name: 'stop',
        description: 'Stop playing and leave the channel'
    },
    {
        name: 'loop',
        description: 'Toggle loop mode',
        options: [
            {
                name: 'mode',
                type: 3,
                description: 'Loop mode (off, song, queue)',
                required: true,
                choices: [
                    { name: 'Off', value: 'off' },
                    { name: 'Song', value: 'song' },
                    { name: 'Queue', value: 'queue' }
                ]
            }
        ]
    },
    {
        name: 'shuffle',
        description: 'Shuffle the queue'
    },
    {
        name: 'remove',
        description: 'Remove a song from the queue',
        options: [
            {
                name: 'index',
                type: 4,
                description: 'Queue index to remove',
                required: true
            }
        ]
    },
    {
        name: 'eq',
        description: 'Apply an equalizer preset',
        options: [
            {
                name: 'preset',
                type: 3,
                description: 'Equalizer preset',
                required: true,
                choices: [
                    { name: 'Flat', value: 'flat' },
                    { name: 'Bass Boost', value: 'bass' },
                    { name: 'Treble Boost', value: 'treble' },
                    { name: 'Vocal', value: 'vocal' },
                    { name: 'Piano', value: 'piano' }
                ]
            }
        ]
    },
    {
        name: 'playlist-save',
        description: 'Save the current queue as a playlist',
        options: [
            {
                name: 'name',
                type: 3,
                description: 'Playlist name',
                required: true
            }
        ]
    },
    {
        name: 'playlist-load',
        description: 'Load a saved playlist',
        options: [
            {
                name: 'name',
                type: 3,
                description: 'Playlist name',
                required: true
            }
        ]
    },
    {
        name: 'playlist-list',
        description: 'List all saved playlists'
    },
    {
        name: 'stats',
        description: 'Show music statistics'
    },
    {
        name: 'announce',
        description: 'Toggle music announcements in a channel',
        options: [
            {
                name: 'channel',
                type: 7,
                description: 'Channel to announce in (leave blank to disable)',
                required: false
            }
        ]
    },
    {
        name: 'djrole',
        description: 'Set the DJ role for advanced controls',
        options: [
            {
                name: 'role',
                type: 8,
                description: 'DJ role (leave blank to remove)',
                required: false
            }
        ]
    },
    {
        name: 'performance',
        description: 'Show instant playback performance stats'
    }
];

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');
        
        await rest.put(
            Routes.applicationCommands(config.clientId),
            { body: commands }
        );
        
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();