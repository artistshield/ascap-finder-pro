import { useState } from 'react';
import { Trash2, Download, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSavedIPIs, SavedIPI } from '@/hooks/useSavedIPIs';
import { exportToCSV, exportToJSON } from '@/lib/export';

export function SavedIPIsSection() {
  const { savedIPIs, isLoading, deleteIPIs, isDeleting } = useSavedIPIs();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<string>('all');

  const filteredIPIs = filterType === 'all' 
    ? savedIPIs 
    : savedIPIs.filter((ipi) => ipi.type === filterType);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredIPIs.map((ipi) => ipi.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSelection = new Set(selectedIds);
    if (checked) {
      newSelection.add(id);
    } else {
      newSelection.delete(id);
    }
    setSelectedIds(newSelection);
  };

  const handleDelete = () => {
    deleteIPIs(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  const handleExportCSV = () => {
    const dataToExport = selectedIds.size > 0 
      ? filteredIPIs.filter((ipi) => selectedIds.has(ipi.id))
      : filteredIPIs;
    exportToCSV(dataToExport);
  };

  const handleExportJSON = () => {
    const dataToExport = selectedIds.size > 0 
      ? filteredIPIs.filter((ipi) => selectedIds.has(ipi.id))
      : filteredIPIs;
    exportToJSON(dataToExport);
  };

  const allSelected = filteredIPIs.length > 0 && filteredIPIs.every((ipi) => selectedIds.has(ipi.id));

  const typeColors = {
    writer: 'bg-primary/20 text-primary border-primary/30',
    publisher: 'bg-secondary/20 text-secondary border-secondary/30',
    performer: 'bg-accent/20 text-accent border-accent/30',
  };

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <CardTitle className="text-xl flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
            My Saved IPIs
            <Badge variant="secondary" className="ml-2">{savedIPIs.length}</Badge>
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[140px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="writer">Writers</SelectItem>
                <SelectItem value="publisher">Publishers</SelectItem>
                <SelectItem value="performer">Performers</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={filteredIPIs.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportJSON} disabled={filteredIPIs.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              JSON
            </Button>
            <Button 
              variant="destructive" 
              size="sm" 
              onClick={handleDelete} 
              disabled={selectedIds.size === 0 || isDeleting}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete ({selectedIds.size})
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : filteredIPIs.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <p>{filterType === 'all' ? 'No saved IPIs yet' : `No ${filterType}s saved`}</p>
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={handleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>IPI Number</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Saved</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredIPIs.map((ipi) => (
                  <TableRow key={ipi.id} className={selectedIds.has(ipi.id) ? 'bg-primary/10' : ''}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(ipi.id)}
                        onCheckedChange={(checked) => handleSelectOne(ipi.id, checked as boolean)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{ipi.name}</TableCell>
                    <TableCell>
                      <code className="px-2 py-1 rounded bg-muted text-sm font-mono">
                        {ipi.ipi_number}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={typeColors[ipi.type]}>
                        {ipi.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(ipi.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
