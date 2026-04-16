// =============================================================================
// Web Skill Template
//
// Gives haseefs web research capabilities: search, read pages with
// chunk-based relevance extraction, raw HTML access, and link extraction.
//
// Supported search providers: Serper, Google Custom Search, Tavily
// Content extraction: @mozilla/readability + jsdom
// =============================================================================

import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";
import { JSDOM } from "jsdom";
import type { SkillTemplateDefinition, SkillHandler, ToolCallContext } from "../types.js";
import { SkillCache } from "../cache.js";

// =============================================================================
// Template Definition
// =============================================================================

export const webTemplate: SkillTemplateDefinition = {
  name: "web",
  displayName: "Web Research",
  description:
    "Search the web, read pages with smart content extraction, and extract links. Supports multiple search providers.",
  category: "research",
  configSchema: {
    type: "object",
    properties: {
      searchProvider: {
        type: "string",
        enum: ["serper", "google", "tavily"],
        description: "Search API provider (default: serper)",
        default: "serper",
      },
      searchApiKey: {
        type: "string",
        description: "API key for the search provider",
      },
      googleCxId: {
        type: "string",
        description: "Google Custom Search engine ID (only if provider=google)",
      },
      maxResults: {
        type: "number",
        description: "Max search results per query (default: 10)",
        default: 10,
      },
      maxContentChars: {
        type: "number",
        description: "Max characters returned per read_page call after chunking (default: 15000)",
        default: 15000,
      },
      topChunks: {
        type: "number",
        description: "Number of most-relevant chunks to return (default: 8)",
        default: 8,
      },
      userAgent: {
        type: "string",
        description: "User-Agent header for HTTP requests",
        default: "Mozilla/5.0 (compatible; HsafaBot/1.0)",
      },
      cacheTtlMs: {
        type: "number",
        description: "Cache TTL in milliseconds (default: 300000 = 5 minutes)",
        default: 300000,
      },
    },
    required: ["searchApiKey"],
  },
  tools: [
    {
      name: "web_search",
      description:
        "Search the web. Returns titles, URLs, and snippets ranked by relevance.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query." },
          numResults: {
            type: "number",
            description: "Number of results to return (default: config maxResults).",
          },
          freshness: {
            type: "string",
            enum: ["day", "week", "month"],
            description: "Filter results by recency.",
          },
        },
        required: ["query"],
      },
      mode: "sync" as const,
    },
    {
      name: "read_page",
      description:
        "Fetch a web page and extract the most relevant content chunks for a given query. Uses smart content extraction (Mozilla Readability) and keyword-based relevance scoring. Always pass a query for best results.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL of the page to read." },
          query: {
            type: "string",
            description: "What you're looking for — used to rank and select the most relevant chunks.",
          },
          extractImages: {
            type: "boolean",
            description: "Whether to extract image URLs and alt text (default: false).",
          },
        },
        required: ["url"],
      },
      mode: "sync" as const,
    },
    {
      name: "read_page_raw",
      description:
        "Fetch raw HTML of a page. Optionally extract a specific CSS selector. Useful for structured data, tables, JSON-LD, or when you need the exact HTML structure.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL of the page." },
          selector: {
            type: "string",
            description: "CSS selector to extract a specific element (e.g. 'table.data', 'article', '#content').",
          },
          maxLength: {
            type: "number",
            description: "Max characters to return (default: 30000).",
          },
        },
        required: ["url"],
      },
      mode: "sync" as const,
    },
    {
      name: "extract_links",
      description:
        "Extract all links from a web page, optionally filtered by a URL pattern. Useful for finding specific resources or crawling a site.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL of the page." },
          pattern: {
            type: "string",
            description: "Only include links whose href contains this substring.",
          },
          limit: {
            type: "number",
            description: "Max links to return (default: 50).",
          },
        },
        required: ["url"],
      },
      mode: "sync" as const,
    },
  ],
  instructions: `You have powerful web research capabilities.

RESEARCH STRATEGY:
  1. web_search to find sources
  2. read_page with a query to extract the most relevant parts
  3. Read 2-3 sources and synthesize, always cite URLs
  4. If a page returns a warning about JS rendering, try a different source

SEARCH TIPS:
  - Use specific, well-crafted queries
  - If the first search doesn't answer, reformulate with different terms
  - For current events, use freshness="day" or freshness="week"

READ_PAGE TIPS:
  - Always pass a query to read_page so it returns the most relevant chunks
  - Don't read every search result — pick the 2-3 most promising URLs first
  - If chunks don't answer your question, try a different page

SYNTHESIS:
  - Don't just summarize one page — synthesize across sources
  - Include source URLs [Source](url)
  - Present findings as clear, structured answers`,

  createHandler: (config: Record<string, unknown>): SkillHandler => {
    return createWebHandler(config);
  },
};

// =============================================================================
// Handler
// =============================================================================

interface WebConfig {
  searchProvider: string;
  searchApiKey: string;
  googleCxId?: string;
  maxResults: number;
  maxContentChars: number;
  topChunks: number;
  userAgent: string;
  cacheTtlMs: number;
}

function parseConfig(raw: Record<string, unknown>): WebConfig {
  return {
    searchProvider: (raw.searchProvider as string) || "serper",
    searchApiKey: raw.searchApiKey as string,
    googleCxId: raw.googleCxId as string | undefined,
    maxResults: (raw.maxResults as number) || 10,
    maxContentChars: (raw.maxContentChars as number) || 15000,
    topChunks: (raw.topChunks as number) || 8,
    userAgent: (raw.userAgent as string) || "Mozilla/5.0 (compatible; HsafaBot/1.0)",
    cacheTtlMs: (raw.cacheTtlMs as number) || 300000,
  };
}

function createWebHandler(rawConfig: Record<string, unknown>): SkillHandler {
  const config = parseConfig(rawConfig);
  const searchCache = new SkillCache<SearchResult[]>();
  const pageCache = new SkillCache<{ html: string; url: string }>();

  return {
    async execute(toolName: string, args: Record<string, unknown>, _ctx: ToolCallContext): Promise<unknown> {
      switch (toolName) {
        case "web_search":
          return handleWebSearch(config, args, searchCache);
        case "read_page":
          return handleReadPage(config, args, pageCache);
        case "read_page_raw":
          return handleReadPageRaw(config, args, pageCache);
        case "extract_links":
          return handleExtractLinks(config, args, pageCache);
        default:
          return { error: `Unknown tool: ${toolName}` };
      }
    },
    async destroy() {
      searchCache.clear();
      pageCache.clear();
    },
  };
}

// =============================================================================
// web_search
// =============================================================================

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  position: number;
}

async function handleWebSearch(
  config: WebConfig,
  args: Record<string, unknown>,
  cache: SkillCache<SearchResult[]>,
): Promise<unknown> {
  const query = args.query as string;
  if (!query) return { error: "query is required" };

  const numResults = Math.min((args.numResults as number) || config.maxResults, 20);
  const freshness = args.freshness as string | undefined;

  // Cache key includes query + freshness
  const cacheKey = `search:${query}:${freshness || ""}:${numResults}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return { results: cached, query, cached: true };
  }

  try {
    let results: SearchResult[];

    switch (config.searchProvider) {
      case "serper":
        results = await searchSerper(config.searchApiKey, query, numResults, freshness);
        break;
      case "google":
        results = await searchGoogle(config.searchApiKey, config.googleCxId || "", query, numResults);
        break;
      case "tavily":
        results = await searchTavily(config.searchApiKey, query, numResults);
        break;
      default:
        return { error: `Unknown search provider: ${config.searchProvider}` };
    }

    cache.set(cacheKey, results, config.cacheTtlMs);
    return { results, query, cached: false };
  } catch (err: any) {
    return { error: `Search failed: ${err.message}` };
  }
}

async function searchSerper(
  apiKey: string,
  query: string,
  num: number,
  freshness?: string,
): Promise<SearchResult[]> {
  const body: Record<string, unknown> = { q: query, num };
  if (freshness) {
    // Serper uses tbs param: qdr:d (day), qdr:w (week), qdr:m (month)
    const tbs = freshness === "day" ? "qdr:d" : freshness === "week" ? "qdr:w" : "qdr:m";
    body.tbs = tbs;
  }

  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Serper API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as {
    organic?: Array<{ title: string; link: string; snippet: string; position: number }>;
  };

  return (data.organic || []).map((r, i) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet || "",
    position: r.position || i + 1,
  }));
}

async function searchGoogle(
  apiKey: string,
  cxId: string,
  query: string,
  num: number,
): Promise<SearchResult[]> {
  if (!cxId) throw new Error("googleCxId is required for Google Custom Search");

  const params = new URLSearchParams({
    key: apiKey,
    cx: cxId,
    q: query,
    num: String(Math.min(num, 10)), // Google CSE max 10 per request
  });

  const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
  if (!res.ok) {
    throw new Error(`Google CSE error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as {
    items?: Array<{ title: string; link: string; snippet: string }>;
  };

  return (data.items || []).map((r, i) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet || "",
    position: i + 1,
  }));
}

async function searchTavily(
  apiKey: string,
  query: string,
  num: number,
): Promise<SearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: num,
      include_answer: false,
    }),
  });

  if (!res.ok) {
    throw new Error(`Tavily API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as {
    results?: Array<{ title: string; url: string; content: string }>;
  };

  return (data.results || []).map((r, i) => ({
    title: r.title,
    url: r.url,
    snippet: r.content || "",
    position: i + 1,
  }));
}

// =============================================================================
// read_page — fetch + readability + chunk + relevance scoring
// =============================================================================

interface ContentChunk {
  text: string;
  relevanceScore: number;
}

async function handleReadPage(
  config: WebConfig,
  args: Record<string, unknown>,
  cache: SkillCache<{ html: string; url: string }>,
): Promise<unknown> {
  const url = args.url as string;
  if (!url) return { error: "url is required" };

  const query = args.query as string | undefined;
  const extractImages = args.extractImages === true;

  try {
    // Fetch HTML (cached)
    const { html, finalUrl } = await fetchPage(url, config, cache);

    // Extract readable content via Readability
    const dom = new JSDOM(html, { url: finalUrl });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    // Detect JS-rendered page (suspiciously short content vs large HTML)
    let warning: string | undefined;
    if (!article || !article.textContent || article.textContent.trim().length < 200) {
      if (html.length > 5000) {
        warning =
          "Page may require JavaScript rendering — content may be incomplete. Try a different source.";
      }
    }

    const textContent = article?.textContent?.trim() || "";
    const title = article?.title || "";

    if (!textContent && !warning) {
      return { title, url: finalUrl, wordCount: 0, chunks: [], warning: "No readable content found." };
    }

    // Split into chunks at paragraph boundaries (~500 tokens ≈ ~2000 chars)
    const chunks = splitIntoChunks(textContent, 2000);

    // Score chunks by relevance to query
    let scoredChunks: ContentChunk[];
    if (query) {
      scoredChunks = scoreChunksByRelevance(chunks, query);
    } else {
      // No query: return in reading order with neutral scores
      scoredChunks = chunks.map((text) => ({ text, relevanceScore: 1.0 }));
    }

    // Take top N chunks
    const topChunks = scoredChunks.slice(0, config.topChunks);

    // Truncate total to maxContentChars
    let totalChars = 0;
    const finalChunks: ContentChunk[] = [];
    for (const chunk of topChunks) {
      if (totalChars + chunk.text.length > config.maxContentChars) {
        // Include a truncated version of this chunk if we have room
        const remaining = config.maxContentChars - totalChars;
        if (remaining > 200) {
          finalChunks.push({
            text: chunk.text.slice(0, remaining) + "...",
            relevanceScore: chunk.relevanceScore,
          });
        }
        break;
      }
      finalChunks.push(chunk);
      totalChars += chunk.text.length;
    }

    // Extract images if requested
    let images: Array<{ src: string; alt: string }> | undefined;
    if (extractImages && article) {
      const $ = cheerio.load(article.content || "");
      images = [];
      $("img").each((_, el) => {
        const src = $(el).attr("src");
        const alt = $(el).attr("alt") || "";
        if (src && images!.length < 20) {
          // Resolve relative URLs
          let absoluteSrc = src;
          try {
            absoluteSrc = new URL(src, finalUrl).href;
          } catch { /* keep as-is */ }
          images!.push({ src: absoluteSrc, alt });
        }
      });
    }

    const wordCount = textContent.split(/\s+/).length;

    const result: Record<string, unknown> = {
      title,
      url: finalUrl,
      wordCount,
      chunks: finalChunks,
    };
    if (images && images.length > 0) result.images = images;
    if (warning) result.warning = warning;
    result.cached = false;

    return result;
  } catch (err: any) {
    return { error: `Failed to read page: ${err.message}`, url };
  }
}

// =============================================================================
// read_page_raw — fetch + optional CSS selector
// =============================================================================

async function handleReadPageRaw(
  config: WebConfig,
  args: Record<string, unknown>,
  cache: SkillCache<{ html: string; url: string }>,
): Promise<unknown> {
  const url = args.url as string;
  if (!url) return { error: "url is required" };

  const selector = args.selector as string | undefined;
  const maxLength = (args.maxLength as number) || 30000;

  try {
    const { html, finalUrl } = await fetchPage(url, config, cache);

    let output: string;
    let statusCode = 200;

    if (selector) {
      const $ = cheerio.load(html);
      const selected = $(selector);
      if (selected.length === 0) {
        return {
          error: `Selector "${selector}" not found on page`,
          url: finalUrl,
          statusCode,
        };
      }
      output = selected.html() || "";
    } else {
      output = html;
    }

    // Truncate
    if (output.length > maxLength) {
      output = output.slice(0, maxLength) + "\n... [truncated]";
    }

    return {
      html: output,
      url: finalUrl,
      statusCode,
      contentType: "text/html",
    };
  } catch (err: any) {
    return { error: `Failed to fetch page: ${err.message}`, url };
  }
}

// =============================================================================
// extract_links
// =============================================================================

async function handleExtractLinks(
  config: WebConfig,
  args: Record<string, unknown>,
  cache: SkillCache<{ html: string; url: string }>,
): Promise<unknown> {
  const url = args.url as string;
  if (!url) return { error: "url is required" };

  const pattern = args.pattern as string | undefined;
  const limit = (args.limit as number) || 50;

  try {
    const { html, finalUrl } = await fetchPage(url, config, cache);
    const $ = cheerio.load(html);

    const links: Array<{ text: string; href: string; isExternal: boolean }> = [];
    const seen = new Set<string>();
    const baseHost = new URL(finalUrl).hostname;

    $("a[href]").each((_, el) => {
      if (links.length >= limit) return false; // break

      const href = $(el).attr("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;

      let absoluteHref: string;
      try {
        absoluteHref = new URL(href, finalUrl).href;
      } catch {
        return; // skip invalid URLs
      }

      // Skip duplicates
      if (seen.has(absoluteHref)) return;

      // Apply pattern filter
      if (pattern && !absoluteHref.includes(pattern)) return;

      seen.add(absoluteHref);

      let isExternal = false;
      try {
        isExternal = new URL(absoluteHref).hostname !== baseHost;
      } catch { /* keep false */ }

      const text = $(el).text().trim().slice(0, 200) || "";

      links.push({ text, href: absoluteHref, isExternal });
    });

    return { links, count: links.length };
  } catch (err: any) {
    return { error: `Failed to extract links: ${err.message}`, url };
  }
}

// =============================================================================
// Shared: fetch page with caching
// =============================================================================

const FETCH_TIMEOUT_MS = 15000;

async function fetchPage(
  url: string,
  config: WebConfig,
  cache: SkillCache<{ html: string; url: string }>,
): Promise<{ html: string; finalUrl: string }> {
  // Check cache
  const cached = cache.get(`page:${url}`);
  if (cached) {
    return { html: cached.html, finalUrl: cached.url };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": config.userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const html = await res.text();
    const finalUrl = res.url || url;

    // Cache the fetch
    cache.set(`page:${url}`, { html, url: finalUrl }, config.cacheTtlMs);
    if (finalUrl !== url) {
      cache.set(`page:${finalUrl}`, { html, url: finalUrl }, config.cacheTtlMs);
    }

    return { html, finalUrl };
  } finally {
    clearTimeout(timeout);
  }
}

// =============================================================================
// Chunking + Relevance Scoring
// =============================================================================

/**
 * Split text into chunks at paragraph boundaries.
 * Target chunk size is ~chunkSize characters.
 */
function splitIntoChunks(text: string, chunkSize: number): string[] {
  // Split on double newlines (paragraph boundaries)
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (current.length + trimmed.length + 1 > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      current = trimmed;
    } else {
      current += (current ? "\n\n" : "") + trimmed;
    }
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }

  // If no paragraph breaks, split by sentences
  if (chunks.length <= 1 && text.length > chunkSize) {
    chunks.length = 0;
    const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
    current = "";
    for (const sentence of sentences) {
      if (current.length + sentence.length > chunkSize && current.length > 0) {
        chunks.push(current.trim());
        current = sentence;
      } else {
        current += sentence;
      }
    }
    if (current.trim()) chunks.push(current.trim());
  }

  return chunks;
}

/**
 * Score chunks by keyword overlap with the query (TF-IDF-lite).
 * Returns chunks sorted by relevance (highest first).
 */
function scoreChunksByRelevance(chunks: string[], query: string): ContentChunk[] {
  // Tokenize query into keywords (lowercase, unique, remove stop words)
  const stopWords = new Set([
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "shall", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "about", "between",
    "through", "during", "before", "after", "above", "below", "and", "but",
    "or", "not", "no", "so", "if", "then", "than", "that", "this", "which",
    "what", "when", "where", "who", "how", "it", "its", "i", "my", "me",
    "we", "our", "you", "your", "he", "she", "they", "them", "their",
  ]);

  const queryTokens = query
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 1 && !stopWords.has(t));

  if (queryTokens.length === 0) {
    return chunks.map((text) => ({ text, relevanceScore: 1.0 }));
  }

  // Build document frequency across all chunks
  const df = new Map<string, number>();
  const chunkTokenSets = chunks.map((chunk) => {
    const tokens = new Set(chunk.toLowerCase().split(/\W+/).filter((t) => t.length > 1));
    for (const token of tokens) {
      df.set(token, (df.get(token) || 0) + 1);
    }
    return tokens;
  });

  const N = chunks.length || 1;

  // Score each chunk
  const scored: ContentChunk[] = chunks.map((text, i) => {
    const tokens = chunkTokenSets[i];
    let score = 0;

    for (const qt of queryTokens) {
      if (tokens.has(qt)) {
        // TF = 1 (presence), IDF = log(N / df)
        const idf = Math.log(N / (df.get(qt) || 1));
        score += 1 + idf; // boost by IDF
      } else {
        // Partial match — check if any chunk token starts with query token
        for (const ct of tokens) {
          if (ct.startsWith(qt) || qt.startsWith(ct)) {
            score += 0.3;
            break;
          }
        }
      }
    }

    // Normalize by query token count
    const relevanceScore = Math.round((score / queryTokens.length) * 100) / 100;
    return { text, relevanceScore };
  });

  // Sort by relevance, highest first
  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

  return scored;
}

export default webTemplate;
