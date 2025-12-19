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

    // For performer searches, first find the real name via web search
    if (searchType === 'performer') {
      console.log(`Searching for performer real name: ${query}`);
      
      // Use Firecrawl search to find the performer's real name
      const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `"${query}" real name birth name wikipedia`,
          limit: 5,
        }),
      });

      const searchData = await searchResponse.json();
      console.log('Web search results:', JSON.stringify(searchData).substring(0, 2000));

      // Extract real name from search results
      let realName = extractRealName(query, searchData);
      
      if (!realName) {
        // Try a more direct search
        const altSearchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `${query} singer rapper artist born legal name`,
            limit: 5,
          }),
        });
        
        const altSearchData = await altSearchResponse.json();
        console.log('Alt search results:', JSON.stringify(altSearchData).substring(0, 2000));
        realName = extractRealName(query, altSearchData);
      }

      const searchName = realName || query;
      
      if (!realName) {
        console.log('Could not find real name for performer, using stage name');
      } else {
        console.log(`Found real name for ${query}: ${realName}`);
      }

      // Now search ASCAP writers with the real name
      const writerResults = await searchASCAPWriters(searchName, apiKey);
      
      // Mark results as performer type
      const performerResults = writerResults.map(r => ({
        ...r,
        type: 'performer' as const
      }));

      console.log(`Found ${performerResults.length} results for performer: ${query} (searched as: ${searchName})`);

      return new Response(
        JSON.stringify({ success: true, results: performerResults, realName: searchName }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For writer and publisher searches, use ASCAP directly
    const encodedQuery = encodeURIComponent(query);
    let searchUrl = `https://www.ascap.com/repertory#/ace/search/`;
    
    switch (searchType) {
      case 'writer':
        searchUrl += `writer/${encodedQuery}`;
        break;
      case 'publisher':
        searchUrl += `publisher/${encodedQuery}`;
        break;
      default:
        searchUrl += `workID/${encodedQuery}`;
    }

    console.log('Scraping ASCAP URL:', searchUrl);

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
        blockAds: false,
        proxy: 'stealth',
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
              
              if (results.length === 0) {
                const links = document.querySelectorAll('a[href*="ace"], .writer-name, .publisher-name, .performer-name, [class*="name"]');
                links.forEach((link) => {
                  const nameText = link.textContent?.trim();
                  const parent = link.closest('tr, div, li, [class*="result"]');
                  if (parent && nameText) {
                    const parentText = parent.textContent || '';
                    const ipiMatch = parentText.match(/(\\d{9,11})/);
                    if (ipiMatch && !seen.has(ipiMatch[1]) && nameText.length > 1 && nameText.length < 80) {
                      seen.add(ipiMatch[1]);
                      results.push({ name: nameText, ipi: ipiMatch[1] });
                    }
                  }
                });
              }
              
              return JSON.stringify(results);
            })();`
          }
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Firecrawl API error:', data);
      return new Response(
        JSON.stringify({ success: false, error: data.error || `Scraping failed` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const markdown = data.data?.markdown || data.markdown || '';
    const html = data.data?.html || data.html || '';
    
    const jsReturns = data.data?.actions?.javascriptReturns || [];
    let jsExtractedResults: Array<{name: string, ipi: string}> = [];
    
    if (jsReturns.length > 1 && jsReturns[1]?.value) {
      try {
        jsExtractedResults = JSON.parse(jsReturns[1].value);
        console.log('JS extracted results:', jsExtractedResults);
      } catch (e) {
        console.log('Failed to parse JS results:', jsReturns[1]?.value);
      }
    }
    
    console.log('HTML preview (first 2000 chars):', html.substring(0, 2000));
    console.log('Markdown preview (first 1500 chars):', markdown.substring(0, 1500));

    const results = parseASCAPResults(markdown, html, searchType, jsExtractedResults);

    console.log(`Found ${results.length} results for ${searchType}: ${query}`);

    return new Response(
      JSON.stringify({ success: true, results, rawContent: data.data?.markdown || data.markdown }),
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

function extractRealName(stageName: string, searchData: any): string | null {
  const results = searchData.data || searchData.results || [];
  const stageNameLower = stageName.toLowerCase();
  
  // Common patterns for real names in search results
  const realNamePatterns = [
    /(?:born|birth name|real name|legal name|née)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/gi,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})(?:\s*,?\s*(?:known (?:professionally|as)|stage name|better known as|born))/gi,
    /\((?:born|née)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\)/gi,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s*\(.*?(?:stage name|known as|professionally).*?\)/gi,
  ];
  
  for (const result of results) {
    const content = (result.markdown || result.description || result.content || result.snippet || '');
    const title = result.title || '';
    const fullText = `${title} ${content}`;
    
    // Skip if this doesn't seem to be about the performer
    if (!fullText.toLowerCase().includes(stageNameLower)) {
      continue;
    }
    
    console.log('Checking content for real name:', fullText.substring(0, 500));
    
    for (const pattern of realNamePatterns) {
      pattern.lastIndex = 0; // Reset regex
      const matches = fullText.matchAll(new RegExp(pattern.source, 'gi'));
      
      for (const match of matches) {
        const potentialName = match[1]?.trim();
        if (potentialName && 
            potentialName.length > 3 && 
            potentialName.length < 50 &&
            !potentialName.toLowerCase().includes(stageNameLower) &&
            potentialName.split(' ').length >= 2) {
          console.log(`Found potential real name: ${potentialName}`);
          return potentialName;
        }
      }
    }
    
    // Also try to find "FirstName LastName" patterns near mentions of real/birth name
    const birthNameIndex = fullText.toLowerCase().search(/(?:born|birth name|real name|legal name)/);
    if (birthNameIndex !== -1) {
      const nearbyText = fullText.substring(birthNameIndex, birthNameIndex + 100);
      const nameMatch = nearbyText.match(/([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
      if (nameMatch && nameMatch[1] && nameMatch[1].split(' ').length >= 2) {
        const name = nameMatch[1].trim();
        if (!name.toLowerCase().includes(stageNameLower) && name.length > 5) {
          console.log(`Found real name near keyword: ${name}`);
          return name;
        }
      }
    }
  }
  
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
      blockAds: false,
      proxy: 'stealth',
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

function parseASCAPResults(
  markdown: string, 
  html: string, 
  searchType: string,
  jsExtracted: Array<{name: string, ipi: string}> = []
): SearchResult[] {
  const results: SearchResult[] = [];
  const seen = new Set<string>();
  
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
  
  const ipiRegex = /\b(\d{9,11})\b/g;
  
  const tableRowPattern = /<tr[^>]*>[\s\S]*?<td[^>]*>([^<]+)<\/td>[\s\S]*?<td[^>]*>(\d{9,11})<\/td>[\s\S]*?<\/tr>/gi;
  let match;
  
  while ((match = tableRowPattern.exec(html)) !== null) {
    const name = match[1].trim();
    const ipi = match[2];
    const key = `${ipi}`;
    
    if (!seen.has(key) && name.length > 1 && name.length < 100 && !name.match(/^\d+$/)) {
      seen.add(key);
      results.push({
        name: formatName(name),
        ipiNumber: ipi,
        type: searchType as 'writer' | 'publisher' | 'performer',
        pro: 'ASCAP'
      });
    }
  }
  
  const mdNameIpiPattern = /([A-Z][A-Za-z\s,.'()-]+?)\s*[|\-–]\s*(\d{9,11})/g;
  
  while ((match = mdNameIpiPattern.exec(markdown)) !== null) {
    const name = match[1].trim();
    const ipi = match[2];
    const key = `${ipi}`;
    
    if (!seen.has(key) && name.length > 1 && name.length < 100) {
      seen.add(key);
      results.push({
        name: formatName(name),
        ipiNumber: ipi,
        type: searchType as 'writer' | 'publisher' | 'performer',
        pro: 'ASCAP'
      });
    }
  }
  
  const tablePattern = /\|\s*([^|]+?)\s*\|\s*(\d{9,11})\s*\|/g;
  
  while ((match = tablePattern.exec(markdown)) !== null) {
    const name = match[1].trim();
    const ipi = match[2];
    const key = `${ipi}`;
    
    if (!seen.has(key) && name.length > 1 && name.length < 100 && !name.match(/^\d+$/) && !name.match(/^IPI/i)) {
      seen.add(key);
      results.push({
        name: formatName(name),
        ipiNumber: ipi,
        type: searchType as 'writer' | 'publisher' | 'performer',
        pro: 'ASCAP'
      });
    }
  }
  
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
          const key = `${ipiMatch[1]}`;
          if (!seen.has(key)) {
            seen.add(key);
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
