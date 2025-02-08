require('dotenv').config();
const { Client } = require('discord.js-selfbot-v13');
const client = new Client();

// Parse the bump channels from the .env file
const bumpChannels = process.env.BUMP_CHANNELS.split(',');

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    // Function to bump in a specific channel
    async function bump(channelId) {
        const channel = await client.channels.fetch(channelId);
        if (channel) {
            await channel.sendSlash('302050872383242240', 'bump');
            console.log(`Bumped in channel ${channelId}!`);
        } else {
            console.error(`Channel not found: ${channelId}`);
        }
    }

    // Function to loop through all channels and bump them
    async function bumpAllChannels() {
        for (const channelId of bumpChannels) {
            await bump(channelId);
        }
    }

    // Function to loop the bumping process
    function loop() {
        // Send bump message every 2-3 hours, to prevent detection.
        const randomNum = Math.round(Math.random() * (9000000 - 7200000 + 1)) + 7200000;
        setTimeout(async () => {
            await bumpAllChannels();
            loop();
        }, randomNum);
    }

    // Start the bumping process
    bumpAllChannels();
    loop();
});

client.login(process.env.TOKEN);