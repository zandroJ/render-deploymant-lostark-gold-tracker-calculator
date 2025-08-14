const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(cors());
app.use(express.static('public'));

let euServerData = [];
let lastScrapeTime = null;

// Enhanced scraping function using Cheerio
async function scrapeG2G() {
  try {
    console.log('Starting G2G scrape...');
    
    // Fetch the G2G Lost Ark gold page
    const response = await axios.get('https://www.g2g.com/categories/lost-ark-gold', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 15000
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    
    const rawData = [];
    
    // Find all product cards
    $('.row > .col-sm-6').each((i, element) => {
      try {
        const card = $(element);
        const title = card.find('.product-title').text().trim();
        const offersText = card.find('.g-chip-counter').text().trim();
        const priceText = card.find('.amount').text().trim();
        
        // Skip if essential data is missing
        if (!title || !priceText) return;
        
        // Extract numeric values
        const offers = parseInt(offersText.replace(/\D/g, '')) || 0;
        const price = parseFloat(priceText.replace(/[^\d.]/g, '')) || 0;
        
        // Calculate value per 100k
        const valuePer100k = (100000 * price).toFixed(6);
        
        rawData.push({
          server: title,
          offers,
          priceUSD: price,
          valuePer100k
        });
      } catch (err) {
        console.error('Error processing card:', err);
      }
    });
    
    // Filter for EU Central servers
    euServerData = rawData.filter(item => 
      item.server && item.server.includes('EU Central')
    );
    
    lastScrapeTime = new Date();
    console.log(`Scraped ${euServerData.length} EU Central servers`);
    
    return euServerData;
  } catch (err) {
    console.error('Scraping error:', err);
    return [];
  }
}

// Initialize scraping
const init = async () => {
  console.log('Starting initial scrape...');
  await scrapeG2G();
  
  // Schedule every 30 minutes
  cron.schedule('*/30 * * * *', () => {
    console.log('Running scheduled scrape...');
    scrapeG2G();
  });
};

init();

// API Endpoints
app.get('/api/prices', (req, res) => {
  if (euServerData.length === 0) {
    return res.json({
      error: "No server data available yet",
      tip: "Initial scrape takes about 10-15 seconds after server start",
      lastScrapeTime: lastScrapeTime?.toISOString() || null
    });
  }
  res.json({
    status: 'success',
    count: euServerData.length,
    lastScrapeTime: lastScrapeTime.toISOString(),
    data: euServerData
  });
});

app.get('/api/scrape', async (req, res) => {
  try {
    const data = await scrapeG2G();
    
    if (data.length === 0) {
      return res.json({
        status: 'error',
        serverCount: 0,
        lastScrapeTime: lastScrapeTime?.toISOString() || null,
        data: null,
        message: "Scrape completed but no data found"
      });
    }
    
    res.json({
      status: 'success',
      serverCount: data.length,
      lastScrapeTime: lastScrapeTime.toISOString(),
      data
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));