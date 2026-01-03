import { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ascapApi, SearchResult } from '@/lib/api/ascap';
import { useToast } from '@/hooks/use-toast';

interface SearchSectionProps {
  type: 'writer' | 'publisher' | 'performer';
  icon: React.ReactNode;
  results: SearchResult[];
  onResultsChange: (results: SearchResult[]) => void;
}

export function SearchSection({ type, icon, results, onResultsChange }: SearchSectionProps) {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [performerRealName, setPerformerRealName] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsLoading(true);
    try {
      const response = await ascapApi.search(query, type);

      if (response.success) {
        // Performer searches may return a realName even when there are 0 IPI matches
        if (type === 'performer') {
          setPerformerRealName(response.realName || null);

          if (response.realName) {
            toast({
              title: 'Real name found',
              description: response.realName,
            });
          }
        }

        if (response.results) {
          onResultsChange(response.results);

          // Only show "No results" toast if we truly learned nothing useful.
          const shouldShowNoResultsToast =
            response.results.length === 0 && !(type === 'performer' && response.realName);

          if (shouldShowNoResultsToast) {
            toast({
              title: 'No results',
              description: `No ${type}s found for "${query}"`,
            });
          }
        }
      } else {
        toast({
          title: 'Search failed',
          description: response.error || 'Failed to search',
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

        {type === 'performer' && performerRealName && (
          <p className="mt-2 text-sm text-muted-foreground">
            Real name: <span className="font-medium text-foreground">{performerRealName}</span>
          </p>
        )}

        {results.length > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            {results.length} result{results.length !== 1 ? 's' : ''} found
          </p>
        )}
      </CardContent>
    </Card>
  );
}
