const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const TurndownService = require('turndown');

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
    console.log('提取到的系列文章:', topics); // 添加這行來檢查提取到的系列文章
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
    const articleLinks = $('a.qa-list__title-link'); // 更正這行
    if (articleLinks.length <= 5) {
        console.log(`系列文章少於或等於五篇，跳過抓取: ${url}`);
        return articles; // 如果系列文章少於或等於五篇，返回空數組
    }
    const articlePromises = [];
    const turndownService = new TurndownService(); // 初始化 Turndown 服務
    for (let i = 0; i < articleLinks.length; i++) {
        const element = articleLinks[i];
        const articleTitle = $(element).text().trim();
        const articleUrl = $(element).attr('href').trim();
        articlePromises.push(fetchPage(articleUrl).then(articleHtml => {
            const article$ = cheerio.load(articleHtml);
            const articleContentHtml = article$('div.qa-markdown').html().trim();
            const articleContentMarkdown = turndownService.turndown(articleContentHtml); // 將 HTML 轉換為 Markdown
            articles.push({ title: articleTitle, content: articleContentMarkdown, link: articleUrl });
        }));
    }
    await Promise.all(articlePromises);
    console.log('提取到的文章內容:', articles); // 添加這行來檢查提取到的文章內容
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
        if (!topic.articles || topic.articles.length === 0) {
            console.log(`跳過沒有文章的系列: ${topic.title}`);
            return; // 如果沒有文章，跳過該系列
        }
        const topicHash = crypto.createHash('md5').update(topic.title).digest('hex');
        const topicDirPath = path.join(categoryDirPath, topicHash);
        if (!fs.existsSync(topicDirPath)) {
            fs.mkdirSync(topicDirPath);
        }
        const topicFilePath = path.join(topicDirPath, 'index.md');
        let topicContent = `# ${topic.title}\n\n`;
        topic.articles.forEach(article => {
            const articleFilePath = getCacheFilePath(article.link);
            const relativePath = path.relative(topicDirPath, articleFilePath);
            topicContent += `- [${article.title}](${relativePath})\n`;
            fs.writeFileSync(articleFilePath, article.content, 'utf-8'); // 只寫入文章內容
        });
        fs.writeFileSync(topicFilePath, topicContent, 'utf-8');
        indexContent += `- [${topic.title}](${path.relative(categoryDirPath, topicFilePath)})\n`;
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
    const startTime = Date.now(); // 開始計時
    let totalArticles = 0; // 初始化文章計數
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
                const articles = await extractArticles(topicUrl);
                if (articles.length > 0) {
                    topic.articles = articles;
                    totalArticles += articles.length; // 累加文章數量
                }
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
    const endTime = Date.now(); // 結束計時
    const elapsedTime = (endTime - startTime) / 1000; // 計算耗時，單位為秒
    console.log(`爬蟲完成，耗時 ${elapsedTime} 秒`);
    console.log(`共抓取了 ${totalArticles} 篇文章`); // 顯示抓取的文章數量
};

main().catch(console.error);