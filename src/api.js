const axios = require('axios');

/**
 * Fetches games that are currently 100% off on the Steam Store.
 */
async function fetchFreeSteamGames() {
    try {
        const response = await axios.get('https://www.cheapshark.com/api/1.0/deals?storeID=1&upperPrice=0');
        if (!response.data || !Array.isArray(response.data)) return [];

        return response.data
            .filter(deal => parseFloat(deal.savings) === 100)
            .map(deal => ({
                id: `steam-${deal.dealID}`,
                title: deal.title,
                worth: `$${deal.normalPrice}`,
                image: deal.thumb,
                url: `https://www.cheapshark.com/redirect?dealID=${deal.dealID}`,
                store: 'Steam',
                color: '#1b2838'
            }));
    } catch (error) {
        console.error('Steam API Error:', error.message);
        return [];
    }
}

/**
 * Fetches the official free games from Epic Games Store.
 */
async function fetchFreeEpicGames() {
    try {
        const response = await axios.get('https://www.gamerpower.com/api/giveaways?platform=epic-games-store');
        if (!response.data || !Array.isArray(response.data)) return [];

        // Only want the active 100% off games
        return response.data
            .filter(game => game.status === 'Active' && game.worth !== 'N/A')
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
        console.error('Epic API Error:', error.message);
        return [];
    }
}

module.exports = { fetchFreeSteamGames, fetchFreeEpicGames };
