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
};
