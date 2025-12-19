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

    // Build ASCAP search URL based on search type
    const encodedQuery = encodeURIComponent(query);
    let searchUrl = `https://www.ascap.com/repertory#/ace/search/`;
    
    // ASCAP uses different URL patterns for different search types
    switch (searchType) {
      case 'writer':
        searchUrl += `writer/${encodedQuery}`;
        break;
      case 'publisher':
        searchUrl += `publisher/${encodedQuery}`;
        break;
      case 'performer':
        searchUrl += `performer/${encodedQuery}`;
        break;
      default:
        searchUrl += `workID/${encodedQuery}`;
    }

    console.log('Scraping ASCAP URL:', searchUrl);

    // Use Firecrawl to scrape the ASCAP search results page
    // ASCAP is a heavy SPA that requires JavaScript execution to:
    // 1. Accept the Terms modal
    // 2. Wait for results to load
    // 3. Extract data from the rendered page
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
          // Click "I Agree" button using JavaScript - more reliable than CSS selector
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
              
              // ASCAP displays results with name, IPI label, IPI number, PRO label
              // Try multiple strategies to find clean name + IPI pairs
              
              // Strategy 1: Look for elements that contain IPI numbers
              const allElements = document.querySelectorAll('*');
              allElements.forEach((el) => {
                const text = el.textContent || '';
                const ipiMatch = text.match(/(\\d{9,11})/);
                if (ipiMatch && !seen.has(ipiMatch[1])) {
                  // Check if this is a leaf-ish element (not too much nested content)
                  if (el.children.length < 10 && text.length < 200) {
                    // Try to extract name by looking at the text before 'ipi' label
                    const fullText = text.toLowerCase();
                    const ipiIndex = fullText.indexOf('ipi');
                    
                    if (ipiIndex > 0) {
                      // Get text before 'ipi', clean it up
                      let nameText = text.substring(0, ipiIndex).trim();
                      // Remove common noise patterns
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
              
              // Strategy 2: Look for specific ASCAP result structure
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
    
    // Check for JavaScript execution results (from our extract script)
    const jsReturns = data.data?.actions?.javascriptReturns || [];
    let jsExtractedResults: Array<{name: string, ipi: string}> = [];
    
    // The second JS action (index 1) contains our extracted results
    if (jsReturns.length > 1 && jsReturns[1]?.value) {
      try {
        jsExtractedResults = JSON.parse(jsReturns[1].value);
        console.log('JS extracted results:', jsExtractedResults);
      } catch (e) {
        console.log('Failed to parse JS results:', jsReturns[1]?.value);
      }
    }
    
    // Log first 2000 chars of HTML for debugging
    console.log('HTML preview (first 2000 chars):', html.substring(0, 2000));
    console.log('Markdown preview (first 1500 chars):', markdown.substring(0, 1500));

    // Parse the scraped content to extract IPI information
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

function parseASCAPResults(
  markdown: string, 
  html: string, 
  searchType: string,
  jsExtracted: Array<{name: string, ipi: string}> = []
): SearchResult[] {
  const results: SearchResult[] = [];
  const seen = new Set<string>();
  
  // First, use any results extracted via JavaScript execution (most reliable)
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
  
  // If we got JS results, return them (most accurate)
  if (results.length > 0) {
    return results.slice(0, 50);
  }
  
  // Fallback: Try to parse from HTML - look for table rows with IPI data
  // ASCAP typically shows results in a table with columns: Name, IPI#, etc.
  
  // Pattern for IPI numbers (9-11 digits)
  const ipiRegex = /\b(\d{9,11})\b/g;
  
  // Try to find IPI numbers with associated names from the HTML
  // Look for patterns like: <td>Name</td>...<td>123456789</td>
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
  
  // Also try markdown patterns
  // Pattern: Name followed by IPI number
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
  
  // Try table-like markdown (pipes)
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
  
  // Fallback: Look for any IPI numbers and try to find nearby names
  if (results.length === 0) {
    const lines = markdown.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const ipiMatch = line.match(/(\d{9,11})/);
      if (ipiMatch) {
        // Look for a name in the same line or previous line
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
  
  return results.slice(0, 50); // Limit to 50 results
}

function formatName(name: string): string {
  // Clean up and format the name
  return name
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
