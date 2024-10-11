const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const BASE_URL = 'https://ithelp.ithome.com.tw/2024ironman';
const CACHE_DIR = path.join(__dirname, 'cache');
const OUTPUT_FILE = 'topics.md';

if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR);
}

const getCacheFilePath = (url) => {
    const hash = crypto.createHash('md5').update(url).digest('hex');
    return path.join(CACHE_DIR, hash);
};

const fetchPage = async (url) => {
    const cacheFilePath = getCacheFilePath(url);
    if (fs.existsSync(cacheFilePath)) {
        const cachedData = fs.readFileSync(cacheFilePath, 'utf-8');
        return cachedData;
    } else {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
                }
            });
            fs.writeFileSync(cacheFilePath, response.data);
            return response.data;
        } catch (error) {
            console.error('爬蟲過程中發生錯誤:', error);
            throw error;
        }
    }
};

const extractCategories = (html) => {
    const $ = cheerio.load(html);
    const categories = [];
    $('div.col-md-12.class-bar a').each((index, element) => {
        const category = $(element).attr('href');
        const categoryName = $(element).text().trim();
        if (categoryName.toLowerCase() !== 'all') {
            categories.push({ name: categoryName, url: category });
        }
    });
    console.log('提取到的類別:', categories); // 添加這行來檢查提取到的類別
    return categories;
};

const extractTopics = (html) => {
    const $ = cheerio.load(html);
    const topics = [];
    $('div.articles-topic a').each((index, element) => {
        const title = $(element).text().trim();
        const link = $(element).attr('href');
        topics.push({ title, link });
    });
    console.log('提取到的文章:', topics); // 添加這行來檢查提取到的文章
    return topics;
};

const saveTopics = (categoriesWithTopics) => {
    let content = '';
    const uniqueTopics = new Set();

    categoriesWithTopics.forEach(category => {
        content += `## ${category.name}\n`;
        category.topics.forEach(topic => {
            const topicKey = `${topic.title}-${topic.link}`;
            if (!uniqueTopics.has(topicKey)) {
                uniqueTopics.add(topicKey);
                content += `- [${topic.title}](${topic.link})\n`;
            }
        });
        content += '\n';
    });

    fs.writeFileSync(OUTPUT_FILE, content, 'utf-8');
};

const main = async () => {
    try {
        const mainPageHtml = await fetchPage(BASE_URL);
        const categories = extractCategories(mainPageHtml);
        let categoriesWithTopics = [];

        for (const category of categories) {
            const categoryUrl = category.url.startsWith('http') ? category.url : `${BASE_URL}${category.url}`;
            const categoryHtml = await fetchPage(categoryUrl);
            const topics = extractTopics(categoryHtml);
            categoriesWithTopics.push({ name: category.name, topics });
        }

        if (categoriesWithTopics.length > 0) {
            saveTopics(categoriesWithTopics);
        } else {
            console.log('沒有找到任何文章。');
        }
    } catch (error) {
        console.error('爬蟲過程中發生錯誤:', error);
    }
};

main().catch(console.error);