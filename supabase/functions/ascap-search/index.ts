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

    // For performer searches, just return the real name from Wikipedia (no writer search)
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

      // Just return the real name, no writer search
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

    // For writer and publisher searches, search both ASCAP and BMI
    console.log(`Searching ${searchType} in both ASCAP and BMI for: ${query}`);
    
    let ascapResults: SearchResult[] = [];
    let bmiResults: SearchResult[] = [];
    
    if (searchType === 'writer') {
      [ascapResults, bmiResults] = await Promise.all([
        searchASCAPWriters(query, apiKey),
        searchBMIWriters(query, apiKey)
      ]);
    } else if (searchType === 'publisher') {
      [ascapResults, bmiResults] = await Promise.all([
        searchASCAPPublishers(query, apiKey),
        searchBMIPublishers(query, apiKey)
      ]);
    }
    
    // Combine results from both PROs
    const allResults = [...ascapResults, ...bmiResults];
    
    console.log(`Found ${allResults.length} total results for ${searchType}: ${query} (ASCAP: ${ascapResults.length}, BMI: ${bmiResults.length})`);

    return new Response(
      JSON.stringify({ success: true, results: allResults }),
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
  console.log('First 2000 chars of markdown:', wikiMarkdown.substring(0, 2000));
  
  // Wikipedia table format: "| Born | Calvin Cordozar Broadus Jr.<br> (1971-10-20)"
  // This is the most common format for artist pages
  const tablePatterns = [
    // Table format: "| Born | Name<br>" or "| Born | Name |"
    /\|\s*Born\s*\|\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]*\.?)+(?:\s+(?:Jr\.|Sr\.|III?|IV|V))?)\s*(?:<br>|\||\()/i,
    // "Born | Name" without leading pipe
    /Born\s*\|\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]*\.?)+(?:\s+(?:Jr\.|Sr\.|III?|IV|V))?)\s*(?:<br>|\||\()/i,
  ];
  
  for (const pattern of tablePatterns) {
    const match = wikiMarkdown.match(pattern);
    if (match && match[1]) {
      let potentialName = match[1].trim();
      // Clean up any trailing punctuation or dates
      potentialName = potentialName.replace(/\s*\(?\d{1,2}[,\s]+\d{4}\)?.*$/i, '').trim();
      potentialName = potentialName.replace(/\s*\d{4}.*$/i, '').trim();
      potentialName = potentialName.replace(/[,;]$/, '').trim();
      
      console.log(`Table pattern matched: "${potentialName}"`);
      
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
  
  // Look for "Born" line patterns - various formats
  const bornLinePatterns = [
    // "Born Calvin Cordozar Broadus Jr." or "Born: Calvin..."
    /\bBorn[:\s]+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]*\.?)+(?:\s+(?:Jr\.|Sr\.|III?|IV|V)?)?)/i,
    // "born Name" with full name following
    /\bborn\s+([A-Z][a-zA-Z]+\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]*\.?)*(?:\s+(?:Jr\.|Sr\.|III?|IV|V)?)?)/i,
  ];
  
  for (const pattern of bornLinePatterns) {
    const match = wikiMarkdown.match(pattern);
    if (match && match[1]) {
      let potentialName = match[1].trim();
      // Clean up - remove dates that might be captured
      potentialName = potentialName.replace(/\s*\(?\d{1,2}[,\s]+\d{4}\)?.*$/i, '').trim();
      potentialName = potentialName.replace(/\s*\d{4}.*$/i, '').trim();
      potentialName = potentialName.replace(/[,;]$/, '').trim();
      
      console.log(`Born pattern matched: "${potentialName}"`);
      
      // Validate: at least 2 words, not the stage name, reasonable length
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
  
  // Try patterns in first paragraph for intro sentence
  const firstParagraph = wikiMarkdown.split('\n').slice(0, 30).join(' ');
  
  // Pattern: "Stage Name (born Real Name; Date)" or "Stage Name (born Real Name, Date)"
  const stageNameEscaped = stageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const introPatterns = [
    new RegExp(`${stageNameEscaped}[^(]*\\(born\\s+([A-Z][a-zA-Z]+(?:\\s+[A-Z][a-zA-Z]*\\.?)+(?:\\s+(?:Jr\\.|Sr\\.|III?|IV|V)?)?)`, 'i'),
    // "Real Name, known professionally as Stage Name"
    /^[*\s]*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]*\.?)+(?:\s+(?:Jr\.|Sr\.|III?|IV|V)?)?)[*\s]*,?\s*(?:\(|known|better known|professionally)/i,
  ];
  
  for (const pattern of introPatterns) {
    const match = firstParagraph.match(pattern);
    if (match && match[1]) {
      let potentialName = match[1].trim();
      potentialName = potentialName.replace(/[,;]$/, '').trim();
      
      console.log(`Intro pattern matched: "${potentialName}"`);
      
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
        blockAds: false,
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
    console.error('Firecrawl API error searching ASCAP publishers:', data);
    return [];
  }

  const markdown = data.data?.markdown || data.markdown || '';
  const html = data.data?.html || data.html || '';
  
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

async function searchBMIWriters(name: string, apiKey: string): Promise<SearchResult[]> {
  const encodedQuery = encodeURIComponent(name);
  const searchUrl = `https://repertoire.bmi.com/Search/Search?Main_Search_Text=${encodedQuery}&Main_Search=Writer+%2F+Composer&Search_Type=all`;
  
  console.log('Searching BMI writers for:', name);

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
         { type: 'wait', milliseconds: 2000 },
        {
          type: 'executeJavascript',
          script: `(() => {
            // Click Accept button for disclaimer - use vanilla JS only
            const buttons = document.querySelectorAll('button, a, .btn-primary');
            for (const btn of buttons) {
              const text = (btn.textContent || '').trim().toLowerCase();
              if (text === 'accept' || text === 'i accept' || text === 'agree') {
                btn.click();
                return 'clicked';
              }
            }
            return 'not_found';
          })();`
        },
        { type: 'wait', milliseconds: 4000 },
        {
          type: 'executeJavascript',
          script: `(() => {
            const results = [];
            const seen = new Set();
            
            // BMI format: Look for writer names with IPI numbers
            // They typically show: "WRITER NAME" and "IPI: 123456789"
            const rows = document.querySelectorAll('tr, .search-result, [class*="result"], div[class*="row"]');
            rows.forEach((row) => {
              const text = row.textContent || '';
              const ipiMatch = text.match(/IPI[:#\\s]*([\\d]{9,11})/i) || text.match(/(\\d{9,11})/);
              if (ipiMatch) {
                // Try to find the name - usually in a link or heading
                const nameEl = row.querySelector('a[href*="Detailed"], a[href*="writer"], h3, h4, .name, strong');
                let nameText = nameEl ? nameEl.textContent?.trim() : '';
                
                if (!nameText) {
                  // Try to extract name before IPI
                  const beforeIPI = text.split(/IPI/i)[0];
                  const nameMatch = beforeIPI.match(/([A-Z][A-Z\\s,.'()-]+)/);
                  if (nameMatch) nameText = nameMatch[1].trim();
                }
                
                if (nameText && !seen.has(ipiMatch[1]) && nameText.length > 2 && nameText.length < 80) {
                  seen.add(ipiMatch[1]);
                  results.push({ name: nameText, ipi: ipiMatch[1] });
                }
              }
            });
            
            // Also try parsing the page content more broadly
            if (results.length === 0) {
              const content = document.body.textContent || '';
              const ipiPattern = /([A-Z][A-Za-z\\s,.'()-]+?)\\s*IPI[:#\\s]*([\\d]{9,11})/gi;
              let match;
              while ((match = ipiPattern.exec(content)) !== null) {
                const name = match[1].trim();
                const ipi = match[2];
                if (!seen.has(ipi) && name.length > 2 && name.length < 80) {
                  seen.add(ipi);
                  results.push({ name, ipi });
                }
              }
            }
            
            return JSON.stringify(results);
          })();`
        }
      ],
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('Firecrawl API error searching BMI writers:', data);
    return [];
  }

  const markdown = data.data?.markdown || data.markdown || '';
  const html = data.data?.html || data.html || '';
  
  console.log('BMI HTML preview:', html.substring(0, 1500));
  console.log('BMI Markdown preview:', markdown.substring(0, 1000));
  
  const jsReturns = data.data?.actions?.javascriptReturns || [];
  let jsExtractedResults: Array<{name: string, ipi: string}> = [];
  
  if (jsReturns.length > 1 && jsReturns[1]?.value) {
    try {
      jsExtractedResults = JSON.parse(jsReturns[1].value);
      console.log('BMI JS extracted results:', jsExtractedResults);
    } catch (e) {
      console.log('Failed to parse BMI JS results');
    }
  }

  // Parse BMI results
  return parseBMIResults(markdown, html, 'writer', jsExtractedResults);
}

async function searchBMIPublishers(name: string, apiKey: string): Promise<SearchResult[]> {
  const encodedQuery = encodeURIComponent(name);
  const searchUrl = `https://repertoire.bmi.com/Search/Search?Main_Search_Text=${encodedQuery}&Main_Search=Publisher&Search_Type=all`;
  
  console.log('Searching BMI publishers for:', name);

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
         { type: 'wait', milliseconds: 2000 },
        {
          type: 'executeJavascript',
          script: `(() => {
            const buttons = document.querySelectorAll('button, a');
            for (const btn of buttons) {
              if (btn.textContent && btn.textContent.trim() === 'Accept') {
                btn.click();
                return 'clicked';
              }
            }
            return 'not_found';
          })();`
        },
        { type: 'wait', milliseconds: 4000 },
        {
          type: 'executeJavascript',
          script: `(() => {
            const results = [];
            const seen = new Set();
            
            const rows = document.querySelectorAll('tr, .search-result, [class*="result"]');
            rows.forEach((row) => {
              const text = row.textContent || '';
              const ipiMatch = text.match(/IPI[:#\\s]*([\\d]{9,11})/i) || text.match(/(\\d{9,11})/);
              if (ipiMatch) {
                const nameEl = row.querySelector('a[href*="Detailed"], a[href*="publisher"], h3, h4, .name, strong');
                let nameText = nameEl ? nameEl.textContent?.trim() : '';
                
                if (!nameText) {
                  const beforeIPI = text.split(/IPI/i)[0];
                  const nameMatch = beforeIPI.match(/([A-Z][A-Z\\s,.'()-]+)/);
                  if (nameMatch) nameText = nameMatch[1].trim();
                }
                
                if (nameText && !seen.has(ipiMatch[1]) && nameText.length > 2 && nameText.length < 80) {
                  seen.add(ipiMatch[1]);
                  results.push({ name: nameText, ipi: ipiMatch[1] });
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
    console.error('Firecrawl API error searching BMI publishers:', data);
    return [];
  }

  const markdown = data.data?.markdown || data.markdown || '';
  const html = data.data?.html || data.html || '';
  
  const jsReturns = data.data?.actions?.javascriptReturns || [];
  let jsExtractedResults: Array<{name: string, ipi: string}> = [];
  
  if (jsReturns.length > 1 && jsReturns[1]?.value) {
    try {
      jsExtractedResults = JSON.parse(jsReturns[1].value);
      console.log('BMI publisher JS extracted results:', jsExtractedResults);
    } catch (e) {
      console.log('Failed to parse BMI publisher JS results');
    }
  }

  return parseBMIResults(markdown, html, 'publisher', jsExtractedResults);
}

function parseBMIResults(
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
        pro: 'BMI'
      });
    }
  }
  
  if (results.length > 0) {
    return results.slice(0, 50);
  }
  
  // Try to parse from markdown/html
  // BMI format typically: Name IPI: 123456789
  const ipiPattern = /([A-Z][A-Za-z\s,.'()-]+?)\s*IPI[:#\s]*(\d{9,11})/gi;
  let match;
  
  while ((match = ipiPattern.exec(markdown)) !== null) {
    const name = match[1].trim();
    const ipi = match[2];
    
    if (!seen.has(ipi) && name.length > 2 && name.length < 80 && !name.match(/^\d+$/)) {
      seen.add(ipi);
      results.push({
        name: formatName(name),
        ipiNumber: ipi,
        type: searchType as 'writer' | 'publisher' | 'performer',
        pro: 'BMI'
      });
    }
  }
  
  // Also try table pattern
  const tablePattern = /\|\s*([^|]+?)\s*\|\s*(\d{9,11})\s*\|/g;
  
  while ((match = tablePattern.exec(markdown)) !== null) {
    const name = match[1].trim();
    const ipi = match[2];
    
    if (!seen.has(ipi) && name.length > 2 && name.length < 80 && !name.match(/^\d+$/) && !name.match(/^IPI/i)) {
      seen.add(ipi);
      results.push({
        name: formatName(name),
        ipiNumber: ipi,
        type: searchType as 'writer' | 'publisher' | 'performer',
        pro: 'BMI'
      });
    }
  }
  
  return results.slice(0, 50);
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
