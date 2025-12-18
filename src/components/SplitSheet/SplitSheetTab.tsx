import { useState } from 'react';
import { Plus, Users, Building2, Send, FileDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SongInfoForm } from './SongInfoForm';
import { WriterCard } from './WriterCard';
import { ShareSummary } from './ShareSummary';
import { SongInfo, Writer } from './types';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const createEmptyWriter = (): Writer => ({
  id: crypto.randomUUID(),
  fullName: '',
  email: '',
  pro: '',
  ipiNumber: '',
  role: '',
  share: 0,
});

const createEmptySongInfo = (): SongInfo => ({
  title: '',
  artistName: '',
  albumTitle: '',
  releaseDate: '',
  isrcCode: '',
});

export const SplitSheetTab = () => {
  const [songInfo, setSongInfo] = useState<SongInfo>(createEmptySongInfo());
  const [writers, setWriters] = useState<Writer[]>([createEmptyWriter()]);
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();

  const addWriter = () => {
    setWriters([...writers, createEmptyWriter()]);
  };

  const updateWriter = (index: number, writer: Writer) => {
    const updated = [...writers];
    updated[index] = writer;
    setWriters(updated);
  };

  const removeWriter = (index: number) => {
    setWriters(writers.filter((_, i) => i !== index));
  };

  const getRecipientCount = () => {
    let count = 0;
    writers.forEach((w) => {
      if (w.email) count++;
      if (w.publisher?.email) count++;
    });
    return count;
  };

  const writersTotal = writers.reduce((sum, w) => sum + w.share, 0);
  const publishersTotal = writers.reduce((sum, w) => sum + (w.publisher?.share || 0), 0);
  const grandTotal = writersTotal + publishersTotal;
  const isValid = Math.abs(grandTotal - 100) < 0.01;

  const handleSendForSignature = async () => {
    if (!songInfo.title) {
      toast({ title: 'Missing Info', description: 'Please enter a song title', variant: 'destructive' });
      return;
    }
    if (writers.every(w => !w.fullName)) {
      toast({ title: 'Missing Info', description: 'Please add at least one writer', variant: 'destructive' });
      return;
    }
    if (!isValid) {
      toast({ title: 'Invalid Shares', description: 'Shares must total 100%', variant: 'destructive' });
      return;
    }
    const recipientCount = getRecipientCount();
    if (recipientCount === 0) {
      toast({ title: 'No Recipients', description: 'Add email addresses to send for signature', variant: 'destructive' });
      return;
    }
    
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-splitsheet', {
        body: { songInfo, writers }
      });
      
      if (error) throw error;
      
      toast({ 
        title: 'Split Sheet Sent!', 
        description: `Successfully sent to ${data.sent} recipient(s)` 
      });
    } catch (error: any) {
      console.error('Error sending split sheet:', error);
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to send split sheet', 
        variant: 'destructive' 
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleExportPDF = () => {
    toast({ title: 'Export', description: 'PDF export coming soon!' });
  };

  const publishers = writers.filter(w => w.publisher).map(w => ({ writer: w.fullName, publisher: w.publisher! }));

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Song Info */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="pt-6">
          <SongInfoForm songInfo={songInfo} onChange={setSongInfo} />
        </CardContent>
      </Card>

      {/* Writers Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-secondary" />
            Writers
          </h3>
          <Button onClick={addWriter} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Writer
          </Button>
        </div>
        <div className="space-y-4">
          {writers.map((writer, index) => (
            <WriterCard
              key={writer.id}
              writer={writer}
              index={index}
              onChange={(w) => updateWriter(index, w)}
              onRemove={() => removeWriter(index)}
              canRemove={writers.length > 1}
            />
          ))}
        </div>
      </div>

      {/* Publishers Summary */}
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Building2 className="h-5 w-5 text-secondary" />
          Publishers
          <span className="text-sm font-normal text-muted-foreground">(linked to writers)</span>
        </h3>
        {publishers.length === 0 ? (
          <Card className="bg-card/30 border-dashed border-border/50">
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              No publishers added. Click "Add Publisher" on a writer card to link a publisher.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {publishers.map(({ writer, publisher }) => (
              <Card key={publisher.id} className="bg-secondary/5 border-secondary/20">
                <CardContent className="py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{publisher.name || 'Unnamed Publisher'}</p>
                    <p className="text-xs text-muted-foreground">Linked to {writer || 'writer'}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-semibold text-secondary">{publisher.share}%</p>
                    {publisher.pro && <p className="text-xs text-muted-foreground">{publisher.pro}</p>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Share Summary & Actions */}
      <div className="grid md:grid-cols-2 gap-6">
        <ShareSummary writers={writers} />
        
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Send for Signature</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {getRecipientCount()} recipient{getRecipientCount() !== 1 ? 's' : ''} will receive this split sheet
            </p>
            <div className="flex flex-col gap-2">
              <Button 
                onClick={handleSendForSignature} 
                disabled={!isValid || getRecipientCount() === 0 || isSending}
                className="w-full gradient-purple"
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                {isSending ? 'Sending...' : 'Send for Signature'}
              </Button>
              <Button 
                onClick={handleExportPDF} 
                variant="outline"
                className="w-full"
              >
                <FileDown className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
