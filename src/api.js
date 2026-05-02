const axios = require('axios');

/**
 * Fetches games that are currently 100% off on the Steam Store using multiple APIs.
 */
async function fetchFreeSteamGames() {
    const games = [];
    
    // API 1: CheapShark (Good for direct store deals)
    try {
        console.log('🔍 Fetching Steam games from CheapShark...');
        const response = await axios.get('https://www.cheapshark.com/api/1.0/deals?storeID=1&upperPrice=0', { timeout: 10000 });
        if (response.data && Array.isArray(response.data)) {
            response.data
                .filter(deal => parseFloat(deal.savings) >= 99)
                .forEach(deal => {
                    games.push({
                        id: `steam-${deal.gameID}`,
                        title: deal.title,
                        worth: `$${deal.normalPrice}`,
                        image: deal.thumb.replace('capsule_sm_120', 'header'),
                        url: `https://store.steampowered.com/app/${deal.steamAppID}`,
                        store: 'Steam',
                        color: '#1b2838'
                    });
                });
        }
    } catch (error) {
        console.error('❌ CheapShark Steam Error:', error.message);
    }

    // API 2: GamerPower (Good for "Free to Keep" giveaways)
    try {
        console.log('🔍 Fetching Steam games from GamerPower...');
        const response = await axios.get('https://www.gamerpower.com/api/giveaways?platform=steam', { timeout: 10000 });
        if (response.data && Array.isArray(response.data)) {
            response.data
                .filter(game => game.status === 'Active' && game.type === 'Game')
                .forEach(game => {
                    games.push({
                        id: `steam-gp-${game.id}`,
                        title: game.title,
                        worth: game.worth || 'N/A',
                        image: game.image,
                        url: game.open_giveaway_url,
                        store: 'Steam',
                        color: '#1b2838'
                    });
                });
        }
    } catch (error) {
        console.error('❌ GamerPower Steam Error:', error.message);
    }

    // Deduplicate by Title (case-insensitive)
    const uniqueGames = [];
    const seenTitles = new Set();

    for (const game of games) {
        const normalizedTitle = game.title.toLowerCase().trim();
        if (!seenTitles.has(normalizedTitle)) {
            seenTitles.add(normalizedTitle);
            uniqueGames.push(game);
        }
    }

    console.log(`✅ Found ${uniqueGames.length} unique Steam freebies.`);
    return uniqueGames;
}

/**
 * Fetches the official free games from Epic Games Store.
 */
async function fetchFreeEpicGames() {
    try {
        console.log('Fetching Epic Games...');
        const response = await axios.get('https://www.gamerpower.com/api/giveaways?platform=epic-games-store', { timeout: 10000 });
        if (!response.data || !Array.isArray(response.data)) return [];

        // Only want the active 100% off games
        return response.data
            .filter(game => game.status === 'Active' && game.type === 'Game' && game.worth !== 'N/A')
            .map(game => ({
                id: `epic-${game.id}`,
                title: game.title,
                worth: game.worth,
                image: game.image,
                url: game.open_giveaway_url,
                store: 'Epic Games',
                color: '#0078f2'
            }));
    } catch (error) {
        console.error('❌ Epic API Error:', error.message);
        return [];
    }
}

module.exports = { fetchFreeSteamGames, fetchFreeEpicGames };

