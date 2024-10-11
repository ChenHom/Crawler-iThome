const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const BASE_URL = 'https://ithelp.ithome.com.tw/2024ironman';
const CACHE_DIR = path.join(__dirname, 'cache');
const CATEGORIES_DIR = path.join(CACHE_DIR, 'categories');
const OUTPUT_FILE = 'topics.md';

if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR);
}

if (!fs.existsSync(CATEGORIES_DIR)) {
    fs.mkdirSync(CATEGORIES_DIR);
}

const getCacheFilePath = (url) => {
    const hash = crypto.createHash('md5').update(url).digest('hex');
    return path.join(CACHE_DIR, hash + '.html');
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

/**
 * 抓取系列文章的每篇文章內容與標題
 * @param {string} url - 系列文章的 URL
 * @returns {Promise<Array>} - 系列文章的每篇文章內容與標題
 */
const extractArticles = async (url) => {
    const html = await fetchPage(url); // 抓取系列文章頁面的 HTML
    const $ = cheerio.load(html); // 使用 cheerio 解析 HTML
    const articles = [];
    const articleLinks = $('a.qa-list__title-link');
    for (let i = 0; i < articleLinks.length; i++) {
        const element = articleLinks[i];
        const articleTitle = $(element).text().trim();
        const articleLink = $(element).attr('href').trim();
        const articleUrl = articleLink.startsWith('http') ? articleLink : articleLink;
        const articleHtml = await fetchPage(articleUrl);
        const article$ = cheerio.load(articleHtml);
        const articleContent = article$('div.qa-markdown').html().trim();
        articles.push({ title: articleTitle, content: articleContent });
    }
    // console.log('提取到的文章內容:', articles); // 添加這行來檢查提取到的文章內容
    return articles; // 返回系列文章的每篇文章內容與標題
};

const saveCategoryTopics = (categoryName, topics) => {
    const categoryHash = crypto.createHash('md5').update(categoryName).digest('hex');
    const categoryDirPath = path.join(CATEGORIES_DIR, categoryHash);
    if (!fs.existsSync(categoryDirPath)) {
        fs.mkdirSync(categoryDirPath);
    }
    const categoryIndexFilePath = path.join(categoryDirPath, 'index.md');
    let indexContent = `# ${categoryName}\n\n`;
    topics.forEach(topic => {
        const topicHash = crypto.createHash('md5').update(topic.title).digest('hex');
        const topicFilePath = path.join(categoryDirPath, topicHash + '.md');
        let topicContent = `# ${topic.title}\n\n`;
        topic.articles.forEach(article => {
            const articleFilePath = getCacheFilePath(article.link || article.title);
            const relativePath = path.relative(categoryDirPath, articleFilePath);
            topicContent += `- [${article.title}](${relativePath})\n`;
        });
        fs.writeFileSync(topicFilePath, topicContent, 'utf-8');
        indexContent += `- [${topic.title}](${topicHash}.md)\n`;
    });
    fs.writeFileSync(categoryIndexFilePath, indexContent, 'utf-8');
};

const saveTopics = (categoriesWithTopics) => {
    let content = '';
    categoriesWithTopics.forEach(category => {
        const categoryHash = crypto.createHash('md5').update(category.name).digest('hex');
        const relativePath = path.relative(__dirname, path.join(CATEGORIES_DIR, categoryHash, 'index.md'));
        content += `- [${category.name}](${relativePath})\n`;
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

            for (const topic of topics) {
                const topicUrl = topic.link.startsWith('http') ? topic.link : `${BASE_URL}${topic.link}`;
                topic.articles = await extractArticles(topicUrl);
            }

            categoriesWithTopics.push({ name: category.name, topics });
            saveCategoryTopics(category.name, topics);
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