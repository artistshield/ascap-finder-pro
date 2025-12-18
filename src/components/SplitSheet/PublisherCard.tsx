import { Trash2, Building2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Publisher, PRO_OPTIONS } from './types';

interface PublisherCardProps {
  publisher: Publisher;
  onChange: (publisher: Publisher) => void;
  onRemove: () => void;
}

export const PublisherCard = ({ publisher, onChange, onRemove }: PublisherCardProps) => {
  const updateField = <K extends keyof Publisher>(field: K, value: Publisher[K]) => {
    onChange({ ...publisher, [field]: value });
  };

  return (
    <div className="mt-4 p-4 rounded-lg bg-secondary/10 border border-secondary/30 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-secondary">
          <Building2 className="h-4 w-4" />
          <span className="text-xs uppercase tracking-wider font-medium">Publisher</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Publisher Name */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Publisher Name</Label>
        <Input
          value={publisher.name}
          onChange={(e) => updateField('name', e.target.value)}
          placeholder="Publisher name"
          className="bg-background/50"
        />
      </div>

      {/* Email */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Email</Label>
        <Input
          type="email"
          value={publisher.email}
          onChange={(e) => updateField('email', e.target.value)}
          placeholder="publisher@example.com"
          className="bg-background/50"
        />
      </div>

      {/* PRO & IPI */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">PRO</Label>
          <Select value={publisher.pro} onValueChange={(v) => updateField('pro', v)}>
            <SelectTrigger className="bg-background/50">
              <SelectValue placeholder="Select PRO" />
            </SelectTrigger>
            <SelectContent>
              {PRO_OPTIONS.map((pro) => (
                <SelectItem key={pro} value={pro}>{pro}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">IPI Number</Label>
          <Input
            value={publisher.ipiNumber}
            onChange={(e) => updateField('ipiNumber', e.target.value)}
            placeholder="00000000000"
            className="bg-background/50"
          />
        </div>
      </div>

      {/* Share */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Share %</Label>
        <div className="relative">
          <Input
            type="number"
            min={0}
            max={100}
            value={publisher.share}
            onChange={(e) => updateField('share', parseFloat(e.target.value) || 0)}
            className="bg-background/50 pr-8"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
        </div>
      </div>
    </div>
  );
};
