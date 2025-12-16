import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface SavedIPI {
  id: string;
  name: string;
  ipi_number: string;
  type: 'writer' | 'publisher' | 'performer';
  created_at: string;
}

export function useSavedIPIs() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: savedIPIs = [], isLoading } = useQuery({
    queryKey: ['saved-ipis'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('saved_ipis')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as SavedIPI[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (items: { name: string; ipiNumber: string; type: string }[]) => {
      const { error } = await supabase.from('saved_ipis').insert(
        items.map((item) => ({
          name: item.name,
          ipi_number: item.ipiNumber,
          type: item.type,
        }))
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-ipis'] });
      toast({ title: 'Saved', description: 'IPIs saved to collection' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('saved_ipis').delete().in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-ipis'] });
      toast({ title: 'Deleted', description: 'IPIs removed from collection' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  return {
    savedIPIs,
    isLoading,
    saveIPIs: saveMutation.mutate,
    deleteIPIs: deleteMutation.mutate,
    isSaving: saveMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
