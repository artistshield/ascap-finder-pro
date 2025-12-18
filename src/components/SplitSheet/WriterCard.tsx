import { Trash2, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Writer, PRO_OPTIONS, ROLE_OPTIONS } from './types';
import { PublisherCard } from './PublisherCard';

interface WriterCardProps {
  writer: Writer;
  index: number;
  onChange: (writer: Writer) => void;
  onRemove: () => void;
  canRemove: boolean;
}

export const WriterCard = ({ writer, index, onChange, onRemove, canRemove }: WriterCardProps) => {
  const updateField = <K extends keyof Writer>(field: K, value: Writer[K]) => {
    onChange({ ...writer, [field]: value });
  };

  const addPublisher = () => {
    updateField('publisher', {
      id: crypto.randomUUID(),
      name: '',
      email: '',
      pro: '',
      ipiNumber: '',
      share: 0,
    });
  };

  const removePublisher = () => {
    onChange({ ...writer, publisher: undefined });
  };

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
          Writer {index + 1}
        </span>
        <div className="flex items-center gap-2">
          {!writer.publisher && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addPublisher}
              className="text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Publisher
            </Button>
          )}
          {canRemove && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onRemove}
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Full Name */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Full Name</Label>
          <Input
            value={writer.fullName}
            onChange={(e) => updateField('fullName', e.target.value)}
            placeholder="Writer name"
            className="bg-background/50"
          />
        </div>

        {/* Email */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Email</Label>
          <Input
            type="email"
            value={writer.email}
            onChange={(e) => updateField('email', e.target.value)}
            placeholder="email@example.com"
            className="bg-background/50"
          />
        </div>

        {/* PRO & IPI */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">PRO</Label>
            <Select value={writer.pro} onValueChange={(v) => updateField('pro', v)}>
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
              value={writer.ipiNumber}
              onChange={(e) => updateField('ipiNumber', e.target.value)}
              placeholder="00000000000"
              className="bg-background/50"
            />
          </div>
        </div>

        {/* Role & Share */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Role</Label>
            <Select value={writer.role} onValueChange={(v) => updateField('role', v)}>
              <SelectTrigger className="bg-background/50">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((role) => (
                  <SelectItem key={role} value={role}>{role}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Share %</Label>
            <div className="relative">
              <Input
                type="number"
                min={0}
                max={100}
                value={writer.share}
                onChange={(e) => updateField('share', parseFloat(e.target.value) || 0)}
                className="bg-background/50 pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
            </div>
          </div>
        </div>

        {/* Publisher */}
        {writer.publisher && (
          <PublisherCard
            publisher={writer.publisher}
            onChange={(pub) => updateField('publisher', pub)}
            onRemove={removePublisher}
          />
        )}
      </CardContent>
    </Card>
  );
};
