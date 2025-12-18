import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Writer } from './types';

interface ShareSummaryProps {
  writers: Writer[];
}

export const ShareSummary = ({ writers }: ShareSummaryProps) => {
  const writersTotal = writers.reduce((sum, w) => sum + w.share, 0);
  const publishersTotal = writers.reduce((sum, w) => sum + (w.publisher?.share || 0), 0);
  const grandTotal = writersTotal + publishersTotal;
  const isValid = Math.abs(grandTotal - 100) < 0.01;

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Share Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">Writers Total</span>
          <span className="font-mono font-semibold">{writersTotal.toFixed(2)}%</span>
        </div>
        {publishersTotal > 0 && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Publishers Total</span>
            <span className="font-mono font-semibold text-secondary">{publishersTotal.toFixed(2)}%</span>
          </div>
        )}
        <div className="border-t border-border pt-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Grand Total</span>
            <span className={`font-mono font-bold ${isValid ? 'text-green-500' : 'text-destructive'}`}>
              {grandTotal.toFixed(2)}%
            </span>
          </div>
        </div>
        <div className={`flex items-center gap-2 text-xs p-2 rounded-md ${
          isValid ? 'bg-green-500/10 text-green-500' : 'bg-destructive/10 text-destructive'
        }`}>
          {isValid ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              <span>Shares total 100%</span>
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4" />
              <span>Shares must equal 100%</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
