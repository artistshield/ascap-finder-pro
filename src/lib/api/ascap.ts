import { supabase } from '@/integrations/supabase/client';

export interface SearchResult {
  name: string;
  ipiNumber: string;
  type: 'writer' | 'publisher' | 'performer';
  pro: string;
}

export interface ASCAPSearchResponse {
  success: boolean;
  results?: SearchResult[];
  error?: string;
  rawContent?: string;
}

// Helper to generate name format variations
export function generateNameVariations(fullName: string): string[] {
  const variations: string[] = [];
  
  // Add full name as-is
  variations.push(fullName);
  
  // Clean and split the name
  const cleanName = fullName
    .replace(/\s+(Jr\.|Sr\.|III?|IV|V)\.?$/i, '') // Remove suffixes
    .trim();
  
  const parts = cleanName.split(/\s+/).filter(p => p.length > 0);
  
  if (parts.length >= 2) {
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    
    // First + Last only (e.g., "Calvin Broadus") - only if there's a middle name
    if (parts.length > 2) {
      variations.push(`${firstName} ${lastName}`);
    }
    
    // Last, First format (e.g., "Broadus, Calvin")
    variations.push(`${lastName}, ${firstName}`);
  }
  
  // Return unique variations
  return [...new Set(variations)];
}

export const ascapApi = {
  async search(query: string, searchType: 'writer' | 'publisher' | 'performer'): Promise<ASCAPSearchResponse> {
    const { data, error } = await supabase.functions.invoke('ascap-search', {
      body: { query, searchType },
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return data;
  },

  // Search with multiple name variations for better results
  async searchWithVariations(query: string, searchType: 'writer' | 'publisher' | 'performer'): Promise<ASCAPSearchResponse> {
    const variations = generateNameVariations(query);
    const allResults: SearchResult[] = [];
    const seenIpis = new Set<string>();

    console.log('Searching with name variations:', variations);

    for (const variation of variations) {
      const { data, error } = await supabase.functions.invoke('ascap-search', {
        body: { query: variation, searchType },
      });

      if (!error && data?.success && data?.results) {
        for (const result of data.results) {
          // Deduplicate by IPI number
          if (!seenIpis.has(result.ipiNumber)) {
            seenIpis.add(result.ipiNumber);
            allResults.push(result);
          }
        }
      }

      // Stop if we have enough results
      if (allResults.length >= 20) break;
    }

    return {
      success: true,
      results: allResults,
    };
  },
};
