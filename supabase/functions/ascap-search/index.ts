import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchResult {
  name: string;
  ipiNumber: string;
  type: 'writer' | 'publisher' | 'performer';
  pro: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, searchType } = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ success: false, error: 'Query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For performer searches, just return the real name from Wikipedia
    if (searchType === 'performer') {
      console.log(`Searching for performer real name: ${query}`);
      
      let realName: string | null = null;
      
      try {
        const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(query.replace(/\s+/g, '_'))}`;
        console.log('Scraping Wikipedia:', wikiUrl);
        
        const wikiResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: wikiUrl,
            formats: ['markdown'],
            onlyMainContent: true,
            waitFor: 2000,
          }),
        });

        const wikiData = await wikiResponse.json();
        const wikiMarkdown = wikiData.data?.markdown || wikiData.markdown || '';
        console.log('Wikipedia content preview:', wikiMarkdown.substring(0, 1500));
        
        realName = extractRealNameFromWikipedia(query, wikiMarkdown);
        
        if (realName) {
          console.log(`Wikipedia: Found real name for ${query}: ${realName}`);
        }
      } catch (wikiError) {
        console.log('Wikipedia scrape failed:', wikiError);
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          results: [], 
          realName: realName || null, 
          source: realName ? 'wikipedia' : null 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For writer and publisher searches, search ASCAP only
    console.log(`Searching ${searchType} in ASCAP for: ${query}`);
    
    let results: SearchResult[] = [];
    
    if (searchType === 'writer') {
      results = await searchASCAPWriters(query, apiKey);
    } else if (searchType === 'publisher') {
      results = await searchASCAPPublishers(query, apiKey);
    }
    
    console.log(`Found ${results.length} results for ${searchType}: ${query}`);

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ascap-search:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function extractRealNameFromWikipedia(stageName: string, wikiMarkdown: string): string | null {
  const stageNameLower = stageName.toLowerCase();
  
  console.log('Extracting real name from Wikipedia for:', stageName);
  
  // Wikipedia table format: "| Born | Calvin Cordozar Broadus Jr.<br>"
  const tablePatterns = [
    /\|\s*Born\s*\|\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]*\.?)+(?:\s+(?:Jr\.|Sr\.|III?|IV|V))?)\s*(?:<br>|\||\()/i,
    /Born\s*\|\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]*\.?)+(?:\s+(?:Jr\.|Sr\.|III?|IV|V))?)\s*(?:<br>|\||\()/i,
  ];
  
  for (const pattern of tablePatterns) {
    const match = wikiMarkdown.match(pattern);
    if (match && match[1]) {
      let potentialName = match[1].trim();
      potentialName = potentialName.replace(/\s*\(?\d{1,2}[,\s]+\d{4}\)?.*$/i, '').trim();
      potentialName = potentialName.replace(/\s*\d{4}.*$/i, '').trim();
      potentialName = potentialName.replace(/[,;]$/, '').trim();
      
      const words = potentialName.split(/\s+/).filter(w => w.length > 0);
      if (words.length >= 2 && 
          !potentialName.toLowerCase().includes(stageNameLower) &&
          potentialName.length > 5 &&
          potentialName.length < 60) {
        console.log(`Found real name via table pattern: ${potentialName}`);
        return potentialName;
      }
    }
  }
  
  // Look for "Born" line patterns
  const bornLinePatterns = [
    /\bBorn[:\s]+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]*\.?)+(?:\s+(?:Jr\.|Sr\.|III?|IV|V)?)?)/i,
    /\bborn\s+([A-Z][a-zA-Z]+\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]*\.?)*(?:\s+(?:Jr\.|Sr\.|III?|IV|V)?)?)/i,
  ];
  
  for (const pattern of bornLinePatterns) {
    const match = wikiMarkdown.match(pattern);
    if (match && match[1]) {
      let potentialName = match[1].trim();
      potentialName = potentialName.replace(/\s*\(?\d{1,2}[,\s]+\d{4}\)?.*$/i, '').trim();
      potentialName = potentialName.replace(/\s*\d{4}.*$/i, '').trim();
      potentialName = potentialName.replace(/[,;]$/, '').trim();
      
      const words = potentialName.split(/\s+/).filter(w => w.length > 0);
      if (words.length >= 2 && 
          !potentialName.toLowerCase().includes(stageNameLower) &&
          potentialName.length > 5 &&
          potentialName.length < 60) {
        console.log(`Found real name via Born pattern: ${potentialName}`);
        return potentialName;
      }
    }
  }
  
  // Try patterns in first paragraph
  const firstParagraph = wikiMarkdown.split('\n').slice(0, 30).join(' ');
  const stageNameEscaped = stageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const introPatterns = [
    new RegExp(`${stageNameEscaped}[^(]*\\(born\\s+([A-Z][a-zA-Z]+(?:\\s+[A-Z][a-zA-Z]*\\.?)+(?:\\s+(?:Jr\\.|Sr\\.|III?|IV|V)?)?)`, 'i'),
    /^[*\s]*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]*\.?)+(?:\s+(?:Jr\.|Sr\.|III?|IV|V)?)?)[*\s]*,?\s*(?:\(|known|better known|professionally)/i,
  ];
  
  for (const pattern of introPatterns) {
    const match = firstParagraph.match(pattern);
    if (match && match[1]) {
      let potentialName = match[1].trim();
      potentialName = potentialName.replace(/[,;]$/, '').trim();
      
      const words = potentialName.split(/\s+/).filter(w => w.length > 0);
      if (words.length >= 2 && 
          !potentialName.toLowerCase().includes(stageNameLower) &&
          potentialName.length > 5 &&
          potentialName.length < 60) {
        console.log(`Found real name via intro pattern: ${potentialName}`);
        return potentialName;
      }
    }
  }
  
  // Try birth name pattern
  const birthNameMatch = wikiMarkdown.match(/birth\s*name[:\s]+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]*\.?)+(?:\s+(?:Jr\.|Sr\.|III?|IV|V)?)?)/i);
  if (birthNameMatch && birthNameMatch[1]) {
    const name = birthNameMatch[1].trim().replace(/[,;]$/, '');
    const words = name.split(/\s+/).filter(w => w.length > 0);
    if (words.length >= 2 && !name.toLowerCase().includes(stageNameLower)) {
      console.log(`Found real name via birth name pattern: ${name}`);
      return name;
    }
  }
  
  console.log('No real name found in Wikipedia content');
  return null;
}

async function searchASCAPWriters(name: string, apiKey: string): Promise<SearchResult[]> {
  const encodedQuery = encodeURIComponent(name);
  const searchUrl = `https://www.ascap.com/repertory#/ace/search/writer/${encodedQuery}`;
  
  console.log('Searching ASCAP writers for:', name);

  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: searchUrl,
      formats: ['markdown', 'html'],
      onlyMainContent: false,
      waitFor: 5000,
      actions: [
        { type: 'wait', milliseconds: 3000 },
        {
          type: 'executeJavascript',
          script: `(() => {
            const buttons = document.querySelectorAll('button, a, span');
            for (const btn of buttons) {
              if (btn.textContent && btn.textContent.trim() === 'I Agree') {
                btn.click();
                return 'clicked';
              }
            }
            return 'not_found';
          })();`
        },
        { type: 'wait', milliseconds: 6000 },
        {
          type: 'executeJavascript',
          script: `(() => {
            const results = [];
            const seen = new Set();
            
            const allElements = document.querySelectorAll('*');
            allElements.forEach((el) => {
              const text = el.textContent || '';
              const ipiMatch = text.match(/(\\d{9,11})/);
              if (ipiMatch && !seen.has(ipiMatch[1])) {
                if (el.children.length < 10 && text.length < 200) {
                  const fullText = text.toLowerCase();
                  const ipiIndex = fullText.indexOf('ipi');
                  
                  if (ipiIndex > 0) {
                    let nameText = text.substring(0, ipiIndex).trim();
                    nameText = nameText.replace(/^[\\d\\s\\-]+of[\\s\\d]+results?/i, '').trim();
                    nameText = nameText.replace(/^results?/i, '').trim();
                    
                    if (nameText && nameText.length > 1 && nameText.length < 80 && !nameText.match(/^\\d+$/)) {
                      seen.add(ipiMatch[1]);
                      results.push({ name: nameText, ipi: ipiMatch[1] });
                    }
                  }
                }
              }
            });
            
            return JSON.stringify(results);
          })();`
        }
      ],
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('Firecrawl API error searching writers:', data);
    return [];
  }

  const markdown = data.data?.markdown || data.markdown || '';
  const html = data.data?.html || data.html || '';
  
  console.log('ASCAP Writer markdown preview:', markdown.substring(0, 500));
  
  const jsReturns = data.data?.actions?.javascriptReturns || [];
  let jsExtractedResults: Array<{name: string, ipi: string}> = [];
  
  if (jsReturns.length > 1 && jsReturns[1]?.value) {
    try {
      jsExtractedResults = JSON.parse(jsReturns[1].value);
      console.log('JS extracted writer results:', jsExtractedResults);
    } catch (e) {
      console.log('Failed to parse JS writer results');
    }
  }

  return parseASCAPResults(markdown, html, 'writer', jsExtractedResults);
}

async function searchASCAPPublishers(name: string, apiKey: string): Promise<SearchResult[]> {
  const encodedQuery = encodeURIComponent(name);
  const searchUrl = `https://www.ascap.com/repertory#/ace/search/publisher/${encodedQuery}`;
  
  console.log('Searching ASCAP publishers for:', name);

  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: searchUrl,
      formats: ['markdown', 'html'],
      onlyMainContent: false,
      waitFor: 5000,
      actions: [
        { type: 'wait', milliseconds: 3000 },
        {
          type: 'executeJavascript',
          script: `(() => {
            const buttons = document.querySelectorAll('button, a, span');
            for (const btn of buttons) {
              if (btn.textContent && btn.textContent.trim() === 'I Agree') {
                btn.click();
                return 'clicked';
              }
            }
            return 'not_found';
          })();`
        },
        { type: 'wait', milliseconds: 6000 },
        {
          type: 'executeJavascript',
          script: `(() => {
            const results = [];
            const seen = new Set();
            
            const allElements = document.querySelectorAll('*');
            allElements.forEach((el) => {
              const text = el.textContent || '';
              const ipiMatch = text.match(/(\\d{9,11})/);
              if (ipiMatch && !seen.has(ipiMatch[1])) {
                if (el.children.length < 10 && text.length < 200) {
                  const fullText = text.toLowerCase();
                  const ipiIndex = fullText.indexOf('ipi');
                  
                  if (ipiIndex > 0) {
                    let nameText = text.substring(0, ipiIndex).trim();
                    nameText = nameText.replace(/^[\\d\\s\\-]+of[\\s\\d]+results?/i, '').trim();
                    nameText = nameText.replace(/^results?/i, '').trim();
                    
                    if (nameText && nameText.length > 1 && nameText.length < 80 && !nameText.match(/^\\d+$/)) {
                      seen.add(ipiMatch[1]);
                      results.push({ name: nameText, ipi: ipiMatch[1] });
                    }
                  }
                }
              }
            });
            
            return JSON.stringify(results);
          })();`
        }
      ],
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('Firecrawl API error searching publishers:', data);
    return [];
  }

  const markdown = data.data?.markdown || data.markdown || '';
  const html = data.data?.html || data.html || '';
  
  console.log('ASCAP Publisher markdown preview:', markdown.substring(0, 500));
  
  const jsReturns = data.data?.actions?.javascriptReturns || [];
  let jsExtractedResults: Array<{name: string, ipi: string}> = [];
  
  if (jsReturns.length > 1 && jsReturns[1]?.value) {
    try {
      jsExtractedResults = JSON.parse(jsReturns[1].value);
      console.log('JS extracted ASCAP publisher results:', jsExtractedResults);
    } catch (e) {
      console.log('Failed to parse JS ASCAP publisher results');
    }
  }

  return parseASCAPResults(markdown, html, 'publisher', jsExtractedResults);
}

function parseASCAPResults(
  markdown: string, 
  html: string, 
  searchType: string,
  jsExtracted: Array<{name: string, ipi: string}> = []
): SearchResult[] {
  const results: SearchResult[] = [];
  const seen = new Set<string>();
  
  // First use JS extracted results
  for (const item of jsExtracted) {
    if (item.ipi && item.name && !seen.has(item.ipi)) {
      seen.add(item.ipi);
      results.push({
        name: formatName(item.name),
        ipiNumber: item.ipi,
        type: searchType as 'writer' | 'publisher' | 'performer',
        pro: 'ASCAP'
      });
    }
  }
  
  if (results.length > 0) {
    return results.slice(0, 50);
  }
  
  // Fallback: parse from HTML tables
  const tableRowPattern = /<tr[^>]*>[\s\S]*?<td[^>]*>([^<]+)<\/td>[\s\S]*?<td[^>]*>(\d{9,11})<\/td>[\s\S]*?<\/tr>/gi;
  let match;
  
  while ((match = tableRowPattern.exec(html)) !== null) {
    const name = match[1].trim();
    const ipi = match[2];
    
    if (!seen.has(ipi) && name.length > 1 && name.length < 100 && !name.match(/^\d+$/)) {
      seen.add(ipi);
      results.push({
        name: formatName(name),
        ipiNumber: ipi,
        type: searchType as 'writer' | 'publisher' | 'performer',
        pro: 'ASCAP'
      });
    }
  }
  
  // Try markdown patterns
  const mdNameIpiPattern = /([A-Z][A-Za-z\s,.'()-]+?)\s*[|\-–]\s*(\d{9,11})/g;
  
  while ((match = mdNameIpiPattern.exec(markdown)) !== null) {
    const name = match[1].trim();
    const ipi = match[2];
    
    if (!seen.has(ipi) && name.length > 1 && name.length < 100) {
      seen.add(ipi);
      results.push({
        name: formatName(name),
        ipiNumber: ipi,
        type: searchType as 'writer' | 'publisher' | 'performer',
        pro: 'ASCAP'
      });
    }
  }
  
  // Try table markdown pattern
  const tablePattern = /\|\s*([^|]+?)\s*\|\s*(\d{9,11})\s*\|/g;
  
  while ((match = tablePattern.exec(markdown)) !== null) {
    const name = match[1].trim();
    const ipi = match[2];
    
    if (!seen.has(ipi) && name.length > 1 && name.length < 100 && !name.match(/^\d+$/) && !name.match(/^IPI/i)) {
      seen.add(ipi);
      results.push({
        name: formatName(name),
        ipiNumber: ipi,
        type: searchType as 'writer' | 'publisher' | 'performer',
        pro: 'ASCAP'
      });
    }
  }
  
  // Last resort: look for IPI numbers with nearby names
  if (results.length === 0) {
    const lines = markdown.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const ipiMatch = line.match(/(\d{9,11})/);
      if (ipiMatch) {
        let name = '';
        const nameMatch = line.match(/([A-Z][a-zA-Z\s,.'()-]{2,50})/);
        if (nameMatch && !nameMatch[1].match(/^\d/)) {
          name = nameMatch[1].trim();
        } else if (i > 0) {
          const prevNameMatch = lines[i-1].match(/([A-Z][a-zA-Z\s,.'()-]{2,50})/);
          if (prevNameMatch && !prevNameMatch[1].match(/^\d/)) {
            name = prevNameMatch[1].trim();
          }
        }
        
        if (name && name.length > 2 && name.length < 100) {
          if (!seen.has(ipiMatch[1])) {
            seen.add(ipiMatch[1]);
            results.push({
              name: formatName(name),
              ipiNumber: ipiMatch[1],
              type: searchType as 'writer' | 'publisher' | 'performer',
              pro: 'ASCAP'
            });
          }
        }
      }
    }
  }
  
  return results.slice(0, 50);
}

function formatName(name: string): string {
  return name
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
