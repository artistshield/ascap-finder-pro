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
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: searchUrl,
        formats: ['markdown', 'html'],
        // ASCAP gates results behind a Terms modal; keep full page content and click "I Agree".
        onlyMainContent: false,
        waitFor: 2000,
        actions: [
          { type: 'wait', milliseconds: 1500 },
          { type: 'click', selector: 'text=I Agree' },
          { type: 'wait', milliseconds: 6000 },
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

    // Parse the scraped content to extract IPI information
    const results = parseASCAPResults(data.data?.markdown || data.markdown || '', searchType);

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

function parseASCAPResults(markdown: string, searchType: string): SearchResult[] {
  const results: SearchResult[] = [];
  
  // ASCAP typically displays results with IPI numbers in format like "IPI: 123456789" or similar patterns
  // Look for patterns that match names with IPI numbers
  
  // Pattern 1: Look for IPI number patterns (usually 9-11 digits)
  const ipiPattern = /(?:IPI[:\s#]*)?(\d{9,11})/gi;
  
  // Pattern 2: Look for name patterns followed by IPI
  const nameIpiPattern = /([A-Z][A-Z\s,.'()-]+?)(?:\s*[-|]\s*|\s+)(?:IPI[:\s#]*)?(\d{9,11})/gi;
  
  // Pattern 3: Table row pattern (common in ASCAP results)
  const tableRowPattern = /\|?\s*([^|]+?)\s*\|?\s*(\d{9,11})\s*\|?/g;
  
  let match;
  const seen = new Set<string>();
  
  // Try name-IPI pattern first
  while ((match = nameIpiPattern.exec(markdown)) !== null) {
    const name = match[1].trim();
    const ipi = match[2];
    const key = `${name}-${ipi}`;
    
    if (!seen.has(key) && name.length > 1 && name.length < 100) {
      seen.add(key);
      results.push({
        name: formatName(name),
        ipiNumber: ipi,
        type: searchType as 'writer' | 'publisher' | 'performer'
      });
    }
  }
  
  // Try table row pattern
  while ((match = tableRowPattern.exec(markdown)) !== null) {
    const name = match[1].trim();
    const ipi = match[2];
    const key = `${name}-${ipi}`;
    
    if (!seen.has(key) && name.length > 1 && name.length < 100 && !name.match(/^\d+$/)) {
      seen.add(key);
      results.push({
        name: formatName(name),
        ipiNumber: ipi,
        type: searchType as 'writer' | 'publisher' | 'performer'
      });
    }
  }
  
  // If no structured results found, extract any IPI numbers with nearby text
  if (results.length === 0) {
    const lines = markdown.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const ipiMatch = line.match(/(\d{9,11})/);
      if (ipiMatch) {
        // Look for a name in the same line or nearby lines
        let name = '';
        const nameMatch = line.match(/([A-Z][a-zA-Z\s,.'()-]+)/);
        if (nameMatch && nameMatch[1].trim().length > 2) {
          name = nameMatch[1].trim();
        } else if (i > 0) {
          const prevNameMatch = lines[i-1].match(/([A-Z][a-zA-Z\s,.'()-]+)/);
          if (prevNameMatch) {
            name = prevNameMatch[1].trim();
          }
        }
        
        if (name && name.length < 100) {
          const key = `${name}-${ipiMatch[1]}`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push({
              name: formatName(name),
              ipiNumber: ipiMatch[1],
              type: searchType as 'writer' | 'publisher' | 'performer'
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
