import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { SearchResult } from '@/lib/api/ascap';

interface ResultsTableProps {
  results: SearchResult[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
}

export function ResultsTable({ results, selectedIds, onSelectionChange }: ResultsTableProps) {
  const getResultId = (result: SearchResult) => `${result.type}-${result.ipiNumber}`;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(results.map(getResultId));
      onSelectionChange(allIds);
    } else {
      onSelectionChange(new Set());
    }
  };

  const handleSelectOne = (result: SearchResult, checked: boolean) => {
    const id = getResultId(result);
    const newSelection = new Set(selectedIds);
    if (checked) {
      newSelection.add(id);
    } else {
      newSelection.delete(id);
    }
    onSelectionChange(newSelection);
  };

  const allSelected = results.length > 0 && results.every((r) => selectedIds.has(getResultId(r)));
  const someSelected = results.some((r) => selectedIds.has(getResultId(r)));

  const typeColors = {
    writer: 'bg-primary/20 text-primary border-primary/30',
    publisher: 'bg-secondary/20 text-secondary border-secondary/30',
    performer: 'bg-accent/20 text-accent border-accent/30',
  };

  if (results.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        <p>Search results will appear here</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card/50 backdrop-blur-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-muted/50">
            <TableHead className="w-12">
              <Checkbox
                checked={allSelected}
                onCheckedChange={handleSelectAll}
                aria-label="Select all"
                className={someSelected && !allSelected ? 'data-[state=checked]:bg-primary/50' : ''}
              />
            </TableHead>
            <TableHead>Name</TableHead>
            <TableHead>IPI Number</TableHead>
            <TableHead>Type</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((result) => {
            const id = getResultId(result);
            const isSelected = selectedIds.has(id);
            return (
              <TableRow
                key={id}
                className={`hover:bg-muted/30 transition-colors ${isSelected ? 'bg-primary/10' : ''}`}
              >
                <TableCell>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) => handleSelectOne(result, checked as boolean)}
                    aria-label={`Select ${result.name}`}
                  />
                </TableCell>
                <TableCell className="font-medium">{result.name}</TableCell>
                <TableCell>
                  <code className="px-2 py-1 rounded bg-muted text-sm font-mono">
                    {result.ipiNumber}
                  </code>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={typeColors[result.type]}>
                    {result.type}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
