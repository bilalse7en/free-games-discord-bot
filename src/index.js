require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, Events, REST, Routes, SlashCommandBuilder, ActivityType } = require('discord.js');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { fetchFreeSteamGames, fetchFreeEpicGames } = require('./api');

// Configuration
const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const DB_PATH = path.join(__dirname, '../database.json');

const http = require('http');

// Keep-alive server
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write("Se7eN Free Games Bot is Online! -.^");
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
        const parsed = data ? JSON.parse(data) : [];
        return Array.isArray(parsed) ? parsed.map(id => String(id)) : [];
    } catch (err) { 
        console.error('❌ Database Load Error:', err.message);
        return []; 
    }
}

function saveDatabase(ids) {
    try { 
        fs.writeFileSync(DB_PATH, JSON.stringify(ids, null, 2)); 
    } catch (err) { 
        console.error('❌ Database Save Error:', err.message);
    }
}

/**
 * Embed Creator
 */
function createGameEmbed(game) {
    const isEpic = game.store.toLowerCase().includes('epic');
    const storeIcon = isEpic 
        ? 'https://upload.wikimedia.org/wikipedia/commons/3/31/Epic_Games_logo.svg' 
        : 'https://upload.wikimedia.org/wikipedia/commons/c/c1/Steam_Logo.png';
    
    return new EmbedBuilder()
        .setTitle(game.title)
        .setURL(game.url)
        .setAuthor({ 
            name: `${game.store} Free Game`, 
            iconURL: storeIcon 
        })
        .setDescription(`🎁 **100% Discount!**\nClaim this premium game permanently to your library before the offer ends.`)
        .setImage(game.image)
        .setColor(game.color || '#2f3136')
        .addFields(
            { name: '💰 Original Price', value: `~~${game.worth}~~`, inline: true },
            { name: '🔥 Current Price', value: '**FREE**', inline: true },
            { name: '📈 Savings', value: '`-100% OFF`', inline: true }
        )
        .setFooter({ text: `Se7eN -,^ Free Games Bot | Store: ${game.store}` })
        .setTimestamp();
}

/**
 * Logic to check and post games
 */
async function checkAndPostGames(forceChannelId = null) {
    const targetChannelId = forceChannelId || CHANNEL_ID;
    if (!targetChannelId || targetChannelId === 'YOUR_CHANNEL_ID_HERE') {
        console.warn('⚠️ No CHANNEL_ID configured. Skipping update.');
        return;
    }

    console.log(`🔍 [${new Date().toLocaleTimeString()}] Checking for games...`);
    
    const steamGames = await fetchFreeSteamGames();
    const epicGames = await fetchFreeEpicGames();
    
    const seenIds = loadDatabase();
    let totalPosted = 0;

    const processStore = async (games, storeLabel) => {
        // Create a unique slug for each game to prevent duplicates even if IDs differ across APIs
        const getSlug = (game) => `${storeLabel.toLowerCase()}-${game.title.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

        // Filter out games we've already seen
        const gamesToPost = forceChannelId ? games : games.filter(game => {
            const slug = getSlug(game);
            // Check both the new slug and the old ID (for backward compatibility)
            return !seenIds.includes(slug) && !seenIds.includes(String(game.id));
        });
        
        if (gamesToPost.length === 0) return 0;

        const channel = await client.channels.fetch(targetChannelId).catch(() => null);
        if (!channel) {
            console.error(`❌ [Se7eN] Could not find channel with ID: ${targetChannelId}`);
            return 0;
        }

        console.log(`📢 [Se7eN] Posting ${gamesToPost.length} new ${storeLabel} games...`);

        for (const game of gamesToPost) {
            const embed = createGameEmbed(game);
            const slug = getSlug(game);
            
            // Professional header with emojis
            const storeEmoji = storeLabel === 'Steam' ? '🎮' : '🚀';
            const header = `## ${storeEmoji} ${storeLabel} New Free Game`;
            const alert = forceChannelId ? "" : `\n🔥 **New 100% FREE Alert!** @everyone`;

            await channel.send({ 
                content: `${header}${alert}`,
                embeds: [embed] 
            }).catch(err => console.error(`❌ [Se7eN] Error sending message:`, err.message));

            if (!seenIds.includes(slug)) {
                seenIds.push(slug);
            }
            totalPosted++;
        }
        return gamesToPost.length;
    };

    const steamCount = await processStore(steamGames, 'Steam');
    const epicCount = await processStore(epicGames, 'Epic Games');

    if (totalPosted > 0) {
        saveDatabase(seenIds);
    }

    return { steamCount, epicCount };
}

// Event: Interaction (Slash Commands)
client.on(Events.InteractionCreate, async interaction => {
    console.log(`📩 Received interaction: ${interaction.commandName} from ${interaction.user.tag}`);
    if (!interaction.isChatInputCommand()) return;
    
    if (interaction.commandName === 'freegames') {
        try {
            await interaction.deferReply();
            const result = await checkAndPostGames(interaction.channelId);
            
            if (!result || (result.steamCount === 0 && result.epicCount === 0)) {
                await interaction.editReply('No 100% free games found on Steam or Epic right now. 🛍️');
            } else {
                await interaction.editReply(`Found ${result.steamCount} Steam and ${result.epicCount} Epic games! 🔥`);
            }
        } catch (err) {
            console.error('❌ Interaction Error:', err);
            if (interaction.deferred) await interaction.editReply('An error occurred while checking for games.').catch(() => {});
        }
    }
});

// Event: Message (Backup Command)
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    const content = message.content.toLowerCase();
    // Trigger on !freegames, free game, free games, or se7en free
    const triggers = ['!freegames', 'free game', 'free games', 'se7en free'];
    
    if (triggers.some(t => content.includes(t))) {
        console.log(`📩 Received message command: "${message.content}" from ${message.author.tag}`);
        try {
            const result = await checkAndPostGames(message.channelId);
            if (!result || (result.steamCount === 0 && result.epicCount === 0)) {
                await message.reply('No 100% free games found right now. 🛍️').catch(() => {});
            }
        } catch (err) {
            console.error('❌ Message Command Error:', err);
        }
    }
});

// Event: Client Ready
client.once(Events.ClientReady, async (readyClient) => {
    console.log(`✅ Logged in as ${readyClient.user.tag}!`);
    console.log(`🤖 Bot is in ${readyClient.guilds.cache.size} servers.`);
    
    readyClient.user.setActivity('for Free Games -.^', { type: ActivityType.Watching });

    await registerCommands();
    
    // Initial check on startup
    console.log('🚀 Running initial game check...');
    await checkAndPostGames().catch(err => console.error('❌ Initial check failed:', err));

    // Schedule: Every 60 minutes
    cron.schedule(`0 */1 * * *`, async () => {
        console.log('⏰ Running scheduled check...');
        await checkAndPostGames().catch(err => console.error('❌ Scheduled check failed:', err));
    });
});

// Login
if (TOKEN && TOKEN !== 'YOUR_BOT_TOKEN_HERE') {
    client.login(TOKEN).catch(err => {
        console.error('❌ Login Error:', err.message);
        if (err.message.includes('TOKEN_INVALID')) {
            console.error('👉 Please check your DISCORD_TOKEN in the .env file.');
        }
    });
} else {
    console.error('❌ No DISCORD_TOKEN found in .env file!');
}

