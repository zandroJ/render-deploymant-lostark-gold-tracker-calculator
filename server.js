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
let scrapeInProgress = false;

// Enhanced G2G scraping function with Cheerio
async function scrapeG2G() {
  if (scrapeInProgress) {
    console.log('Scrape already in progress. Skipping...');
    return euServerData;
  }

  scrapeInProgress = true;
  console.log('Starting G2G scrape...');
  
  try {
    // Fetch the G2G Lost Ark gold page with proper headers
    const response = await axios.get('https://www.g2g.com/categories/lost-ark-gold', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Referer': 'https://www.g2g.com/'
      },
      timeout: 20000
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    
    const rawData = [];
    
    // Process each product card
    $('div[class*="product-card-wrapper"]').each((i, element) => {
      try {
        const card = $(element);
        
        // Extract server name
        const serverElement = card.find('div[class*="product-title"]');
        const server = serverElement.text().trim();
        
        // Extract price
        const priceElement = card.find('span[class*="price-amount"]');
        const priceText = priceElement.text().trim();
        const price = parseFloat(priceText.replace(/[^\d.]/g, '')) || 0;
        
        // Extract offers
        const offersElement = card.find('div[class*="g-chip-counter"]');
        const offersText = offersElement.text().trim();
        const offers = parseInt(offersText.replace(/\D/g, '')) || 0;
        
        // Calculate value per 100k
        const valuePer100k = price > 0 ? (100000 * price).toFixed(6) : '0.000000';
        
        rawData.push({
          server,
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
      item.server && /EU Central/i.test(item.server)
    );
    
    lastScrapeTime = new Date();
    console.log(`Scraped ${euServerData.length} EU Central servers`);
    
    return euServerData;
  } catch (err) {
    console.error('Scraping error:', err);
    return [];
  } finally {
    scrapeInProgress = false;
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
      status: 'pending',
      message: 'No data available yet',
      tip: 'Initial scrape takes about 10-15 seconds after server start',
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
