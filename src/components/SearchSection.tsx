import { useState, useEffect, useRef } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ascapApi, SearchResult, generateNameVariations } from '@/lib/api/ascap';
import { useToast } from '@/hooks/use-toast';

interface SearchSectionProps {
  type: 'writer' | 'publisher' | 'performer';
  icon: React.ReactNode;
  results: SearchResult[];
  onResultsChange: (results: SearchResult[]) => void;
  onSearchExecuted?: () => void;
  onSearchWriterName?: (name: string) => void;
  externalQuery?: string;
  onExternalQueryUsed?: () => void;
}

export function SearchSection({ 
  type, 
  icon, 
  results, 
  onResultsChange, 
  onSearchExecuted,
  onSearchWriterName,
  externalQuery,
  onExternalQueryUsed
}: SearchSectionProps) {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPerformer, setSelectedPerformer] = useState<string>('');
  const [searchedVariations, setSearchedVariations] = useState<string[]>([]);
  const processedQueryRef = useRef<string>('');
  const { toast } = useToast();

  // Handle external query for writers (from performer search)
  useEffect(() => {
    if (externalQuery && type === 'writer' && externalQuery !== processedQueryRef.current) {
      processedQueryRef.current = externalQuery;
      // Clear previous results first
      onResultsChange([]);
      setQuery(externalQuery);
      handlePerformerNameSearch(externalQuery);
    }
  }, [externalQuery]);

  // Special search for performer names - tries multiple variations
  const handlePerformerNameSearch = async (performerName: string) => {
    setIsLoading(true);
    const variations = generateNameVariations(performerName);
    setSearchedVariations(variations);
    
    console.log('Searching writer with name variations:', variations);
    
    try {
      const response = await ascapApi.searchWithVariations(performerName, 'writer');
      if (response.success && response.results) {
        onResultsChange(response.results);
        if (response.results.length === 0) {
          toast({
            title: 'No results',
            description: `No writers found for "${performerName}" (tried: ${variations.join(', ')})`,
          });
        } else {
          toast({
            title: 'Search complete',
            description: `Found ${response.results.length} writer(s) using name variations`,
          });
        }
      } else {
        toast({
          title: 'Search failed',
          description: response.error || 'Failed to search ASCAP',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to connect to search service',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      onExternalQueryUsed?.();
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    // Notify parent to clear other search boxes
    onSearchExecuted?.();
    
    setIsLoading(true);
    setSelectedPerformer('');
    try {
      const response = await ascapApi.search(query, type);
      if (response.success && response.results) {
        onResultsChange(response.results);
        if (response.results.length === 0) {
          toast({
            title: 'No results',
            description: `No ${type}s found for "${query}"`,
          });
        }
      } else {
        toast({
          title: 'Search failed',
          description: response.error || 'Failed to search ASCAP',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to connect to search service',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handlePerformerSelect = (name: string) => {
    setSelectedPerformer(name);
  };

  const handleSearchInWriters = () => {
    if (selectedPerformer && onSearchWriterName) {
      onSearchWriterName(selectedPerformer);
    }
  };

  // Method to clear this section's state (called by parent)
  const clearState = () => {
    setQuery('');
    onResultsChange([]);
    setSelectedPerformer('');
  };

  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
  const typeColors = {
    writer: 'from-primary/20 to-primary/5 border-primary/30',
    publisher: 'from-secondary/20 to-secondary/5 border-secondary/30',
    performer: 'from-accent/20 to-accent/5 border-accent/30',
  };

  return (
    <Card className={`bg-gradient-to-br ${typeColors[type]} border backdrop-blur-sm`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          {icon}
          <span>Search {typeLabel}s</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Input
            placeholder={`Enter ${type} name...`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="bg-background/50"
          />
          <Button onClick={handleSearch} disabled={isLoading || !query.trim()}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
        
        {type !== 'performer' && results.length > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            {results.length} result{results.length !== 1 ? 's' : ''} found
          </p>
        )}

        {/* Performer results with radio buttons */}
        {type === 'performer' && results.length > 0 && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground mb-2">
              {results.length} result{results.length !== 1 ? 's' : ''} found
            </p>
            <RadioGroup value={selectedPerformer} onValueChange={handlePerformerSelect}>
              {results.map((result, index) => (
                <div key={index} className="flex items-center space-x-3 p-2 rounded-md bg-background/30 hover:bg-background/50 transition-colors">
                  <RadioGroupItem value={result.name} id={`performer-${index}`} />
                  <Label htmlFor={`performer-${index}`} className="flex-1 cursor-pointer">
                    <span className="font-medium">{result.name}</span>
                    {result.ipiNumber && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (IPI: {result.ipiNumber})
                      </span>
                    )}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            
            {selectedPerformer && (
              <Button 
                onClick={handleSearchInWriters} 
                className="w-full mt-2"
                variant="secondary"
              >
                <Search className="h-4 w-4 mr-2" />
                Search "{selectedPerformer}" in Writers
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
