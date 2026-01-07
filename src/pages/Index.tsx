import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pen, Building2, Mic2, Save, Download, FileText, LogOut, Shield, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SearchSection } from '@/components/SearchSection';
import { ResultsTable } from '@/components/ResultsTable';
import { SavedIPIsSection } from '@/components/SavedIPIsSection';
import { SplitSheetTab } from '@/components/SplitSheet/SplitSheetTab';
import { SearchResult } from '@/lib/api/ascap';
import { useSavedIPIs } from '@/hooks/useSavedIPIs';
import { exportToCSV, exportToJSON } from '@/lib/export';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

const Index = () => {
  const [writerResults, setWriterResults] = useState<SearchResult[]>([]);
  const [publisherResults, setPublisherResults] = useState<SearchResult[]>([]);
  const [performerResults, setPerformerResults] = useState<SearchResult[]>([]);
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set());
  const [writerSearchQuery, setWriterSearchQuery] = useState<string>('');
  const { saveIPIs, isSaving } = useSavedIPIs();
  const { toast } = useToast();
  const { user, signOut, isAdmin } = useAuth();
  const navigate = useNavigate();

  // Only include writer and publisher results in the table (performer results shown inline)
  const allResults = [...writerResults, ...publisherResults];
  const selectedItems = allResults.filter((r) => selectedResults.has(`${r.type}-${r.ipiNumber}`));

  const handleSaveSelected = () => {
    if (selectedItems.length === 0) {
      toast({ title: 'No selection', description: 'Select items to save', variant: 'destructive' });
      return;
    }
    saveIPIs(selectedItems);
    setSelectedResults(new Set());
  };

  const handleExportSelected = (format: 'csv' | 'json') => {
    if (selectedItems.length === 0) {
      toast({ title: 'No selection', description: 'Select items to export', variant: 'destructive' });
      return;
    }
    const exportData = selectedItems.map((item) => ({
      id: `${item.type}-${item.ipiNumber}`,
      name: item.name,
      ipi_number: item.ipiNumber,
      type: item.type as 'writer' | 'publisher' | 'performer',
      created_at: new Date().toISOString(),
    }));
    if (format === 'csv') {
      exportToCSV(exportData);
    } else {
      exportToJSON(exportData);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  // Clear writer and publisher results when writer search is executed
  const handleWriterSearchExecuted = useCallback(() => {
    setPublisherResults([]);
    setPerformerResults([]);
    setSelectedResults(new Set());
  }, []);

  // Clear writer and performer results when publisher search is executed
  const handlePublisherSearchExecuted = useCallback(() => {
    setWriterResults([]);
    setPerformerResults([]);
    setSelectedResults(new Set());
  }, []);

  // Clear writer and publisher results when performer search is executed
  const handlePerformerSearchExecuted = useCallback(() => {
    setWriterResults([]);
    setPublisherResults([]);
    setSelectedResults(new Set());
  }, []);

  // Handle searching performer name in writers
  const handleSearchPerformerInWriters = useCallback((name: string) => {
    setWriterSearchQuery(name);
    setPublisherResults([]);
    setPerformerResults([]);
    setSelectedResults(new Set());
  }, []);

  const handleWriterQueryUsed = useCallback(() => {
    setWriterSearchQuery('');
  }, []);

  return (
    <div className="min-h-screen bg-background waveform-bg">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full gradient-purple glow-purple flex items-center justify-center">
                <Mic2 className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Publishing IPI Search</h1>
                <p className="text-sm text-muted-foreground">Music Rights Database Explorer</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedItems.length > 0 && (
                <>
                  <span className="text-sm text-muted-foreground">{selectedItems.length} selected</span>
                  <Button size="sm" variant="outline" onClick={() => handleExportSelected('csv')}>
                    <Download className="h-4 w-4 mr-2" />
                    CSV
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleExportSelected('json')}>
                    <Download className="h-4 w-4 mr-2" />
                    JSON
                  </Button>
                  <Button size="sm" onClick={handleSaveSelected} disabled={isSaving}>
                    <Save className="h-4 w-4 mr-2" />
                    Save to Collection
                  </Button>
                </>
              )}
              <div className="flex items-center gap-2 ml-4 pl-4 border-l border-border">
                {isAdmin && (
                  <Button size="sm" variant="outline" onClick={() => navigate('/admin')}>
                    <Shield className="h-4 w-4 mr-2" />
                    Admin
                  </Button>
                )}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">{user?.email}</span>
                </div>
                <Button size="sm" variant="ghost" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Search Fields */}
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            Search ASCAP Repertory
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            <SearchSection
              type="writer"
              icon={<Pen className="h-5 w-5 text-primary" />}
              results={writerResults}
              onResultsChange={setWriterResults}
              onSearchExecuted={handleWriterSearchExecuted}
              externalQuery={writerSearchQuery}
              onExternalQueryUsed={handleWriterQueryUsed}
            />
            <SearchSection
              type="publisher"
              icon={<Building2 className="h-5 w-5 text-secondary" />}
              results={publisherResults}
              onResultsChange={setPublisherResults}
              onSearchExecuted={handlePublisherSearchExecuted}
            />
            <SearchSection
              type="performer"
              icon={<Mic2 className="h-5 w-5 text-accent" />}
              results={performerResults}
              onResultsChange={setPerformerResults}
              onSearchExecuted={handlePerformerSearchExecuted}
              onSearchWriterName={handleSearchPerformerInWriters}
            />
          </div>
        </section>

        {/* Results Section */}
        <section>
          <Tabs defaultValue="results" className="w-full">
            <TabsList className="grid w-full max-w-lg grid-cols-3">
              <TabsTrigger value="results">
                Search Results
                {allResults.length > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-primary/20">{allResults.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="saved">My Collection</TabsTrigger>
              <TabsTrigger value="splitsheet" className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                Split Sheet
              </TabsTrigger>
            </TabsList>
            <TabsContent value="results" className="mt-4">
              <ResultsTable
                results={allResults}
                selectedIds={selectedResults}
                onSelectionChange={setSelectedResults}
              />
            </TabsContent>
            <TabsContent value="saved" className="mt-4">
              <SavedIPIsSection />
            </TabsContent>
            <TabsContent value="splitsheet" className="mt-4">
              <SplitSheetTab />
            </TabsContent>
          </Tabs>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 py-6 mt-auto">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Data sourced from ASCAP Repertory • For music industry research purposes</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
