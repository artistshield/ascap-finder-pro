import { Music, User, Disc, Calendar, Hash } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SongInfo } from './types';

interface SongInfoFormProps {
  songInfo: SongInfo;
  onChange: (info: SongInfo) => void;
}

export const SongInfoForm = ({ songInfo, onChange }: SongInfoFormProps) => {
  const updateField = (field: keyof SongInfo, value: string) => {
    onChange({ ...songInfo, [field]: value });
  };

  return (
    <div className="space-y-6">
      {/* Song Title */}
      <div className="text-center">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Song Title</Label>
        <Input
          value={songInfo.title}
          onChange={(e) => updateField('title', e.target.value)}
          placeholder="Enter song title..."
          className="text-2xl font-semibold text-center bg-transparent border-0 border-b border-border focus-visible:ring-0 focus-visible:border-primary rounded-none h-auto py-2"
        />
      </div>

      {/* Artist & Album */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <User className="h-3 w-3" />
            Artist Name
          </Label>
          <Input
            value={songInfo.artistName}
            onChange={(e) => updateField('artistName', e.target.value)}
            placeholder="Enter artist name..."
            className="bg-card/50"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Disc className="h-3 w-3" />
            Album/Single Title
          </Label>
          <Input
            value={songInfo.albumTitle}
            onChange={(e) => updateField('albumTitle', e.target.value)}
            placeholder="Enter album or single title..."
            className="bg-card/50"
          />
        </div>
      </div>

      {/* Release Date & ISRC */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Calendar className="h-3 w-3" />
            Release Date
          </Label>
          <Input
            type="date"
            value={songInfo.releaseDate}
            onChange={(e) => updateField('releaseDate', e.target.value)}
            className="bg-card/50"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Hash className="h-3 w-3" />
            ISRC Code (Optional)
          </Label>
          <Input
            value={songInfo.isrcCode}
            onChange={(e) => updateField('isrcCode', e.target.value)}
            placeholder="e.g., USRC17607839"
            className="bg-card/50"
          />
        </div>
      </div>
    </div>
  );
};
