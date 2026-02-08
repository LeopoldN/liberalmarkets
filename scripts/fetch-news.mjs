import fs from "node:fs/promises";
import path from "node:path";

const FEED_URL =
  process.env.NEWS_FEED_URL ||
  "https://www.cnbc.com/id/10000664/device/rss/rss.html";

const OUT_PATH = path.join("data", "news.json");
const MAX_ITEMS = 18;

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripCdata(value) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function extractTag(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = block.match(re);
  if (!match) return "";
  return decodeEntities(stripCdata(match[1])).trim();
}

function parseRss(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const block of blocks) {
    const title = extractTag(block, "title");
    const link = extractTag(block, "link") || extractTag(block, "guid");
    const pubDate = extractTag(block, "pubDate");
    if (!title || !link) continue;
    items.push({ title, link, pubDate });
  }

  const deduped = [];
  const seen = new Set();
  for (const item of items) {
    const key = item.link;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= MAX_ITEMS) break;
  }

  return deduped;
}

async function main() {
  const res = await fetch(FEED_URL, {
    headers: {
      "User-Agent": "liberalmarkets-newsbot/1.0",
      Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch RSS: ${res.status}`);
  }

  const xml = await res.text();
  const items = parseRss(xml);

  const payload = {
    generatedAt: new Date().toISOString(),
    source: "CNBC Finance RSS",
    feed: FEED_URL,
    items,
  };

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`Wrote ${items.length} items to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
