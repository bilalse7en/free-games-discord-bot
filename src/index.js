require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, Events, REST, Routes, SlashCommandBuilder } = require('discord.js');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { fetchFreeSteamGames, fetchFreeEpicGames } = require('./api');

// Configuration
const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const DB_PATH = path.join(__dirname, '../database.json');

const http = require('http');

// Create a small server to keep the bot alive on Render/Koyeb
http.createServer((req, res) => {
    res.write("Se7eN Bot is Online! -.^");
    res.end();
}).listen(process.env.PORT || 3000);

// Initialize Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

/**
 * Register Slash Commands
 */
async function registerCommands() {
    const commands = [
        new SlashCommandBuilder()
            .setName('freegames')
            .setDescription('Check for current 100% free games on Steam and Epic!')
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        console.log('🔄 Registering slash commands...');
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Slash commands registered successfully!');
    } catch (error) {
        console.error('❌ Error registering commands:', error);
    }
}

/**
 * Database Functions
 */
function loadDatabase() {
    try {
        if (!fs.existsSync(DB_PATH)) return [];
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return data ? JSON.parse(data) : [];
    } catch (err) { return []; }
}

function saveDatabase(ids) {
    try { fs.writeFileSync(DB_PATH, JSON.stringify(ids, null, 2)); } catch (err) { }
}

/**
 * Embed Creator
 */
function createGameEmbed(game) {
    return new EmbedBuilder()
        .setTitle(`🎮 ${game.title}`)
        .setURL(game.url)
        .setDescription(`**100% FREE on ${game.store}!**\n\nClaim this premium game permanently to your library before the offer ends.`)
        .setImage(game.image)
        .setColor(game.color)
        .addFields(
            { name: '💰 Value', value: `~~${game.worth}~~ **FREE**`, inline: true },
            { name: '🏛️ Store', value: game.store, inline: true },
            { name: '⏳ Duration', value: 'Limited Time', inline: true }
        )
        .setFooter({ text: `Se7eN -,^ Free Games Bot | Store: ${game.store}` })
        .setTimestamp();
}

/**
 * Logic to check and post games
 */
async function checkAndPostGames(forceChannel = null) {
    const targetChannelId = forceChannel || CHANNEL_ID;
    if (!targetChannelId || targetChannelId === 'YOUR_CHANNEL_ID_HERE') return;

    console.log('🔍 Checking for Steam and Epic deals...');
    
    const steamGames = await fetchFreeSteamGames();
    const epicGames = await fetchFreeEpicGames();
    const allGames = [...steamGames, ...epicGames];

    const seenIds = loadDatabase();
    const gamesToPost = forceChannel ? allGames : allGames.filter(game => !seenIds.includes(game.id));

    if (gamesToPost.length === 0) {
        if (forceChannel) return "No 100% free games found on Steam or Epic right now.";
        return;
    }

    const channel = await client.channels.fetch(targetChannelId).catch(() => null);
    if (!channel) return;

    for (const game of gamesToPost) {
        const embed = createGameEmbed(game);
        
        // Determine the heading based on store and "popularity"
        // (We consider games worth more than $20 as "Popular")
        let heading = `## ${game.store}`;
        const isPremium = game.worth.includes('$') && parseFloat(game.worth.replace('$', '')) > 20;
        
        if (isPremium) {
            heading = game.store === 'Steam' ? `## Steam New popular Game` : `## Epic New popular Game`;
        } else if (game.store === 'Epic Games') {
            heading = `## Epic games`;
        }


        await channel.send({ 
            content: forceChannel ? heading : `${heading}\n🚀 **New 100% FREE Alert!** @everyone`,
            embeds: [embed] 
        });
        if (!seenIds.includes(game.id)) seenIds.push(game.id);
    }


    saveDatabase(seenIds);
}

// Event: Interaction (Slash Commands)
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'freegames') {
        await interaction.deferReply();
        const result = await checkAndPostGames(interaction.channelId);
        if (typeof result === 'string') {
            await interaction.editReply(result);
        } else {
            await interaction.editReply('Here are the current 100% free games! 🔥');
        }
    }
});

// Event: Message (Backup Command)
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    if (message.content.toLowerCase() === '!freegames') {
        const result = await checkAndPostGames(message.channelId);
        if (typeof result === 'string') await message.reply(result);
    }
});

// Event: Client Ready
client.once(Events.ClientReady, async (readyClient) => {
    console.log(`✅ Logged in as ${readyClient.user.tag}!`);
    await registerCommands();
    checkAndPostGames();
    cron.schedule(`0 */1 * * *`, () => checkAndPostGames());
});

// Login
if (TOKEN && TOKEN !== 'YOUR_BOT_TOKEN_HERE') {
    client.login(TOKEN).catch(err => console.error('❌ Login Error:', err.message));
}
