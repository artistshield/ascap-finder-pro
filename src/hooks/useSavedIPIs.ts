import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export interface SavedIPI {
  id: string;
  name: string;
  ipi_number: string;
  type: 'writer' | 'publisher' | 'performer';
  created_at: string;
  user_id: string | null;
}

export function useSavedIPIs() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: savedIPIs = [], isLoading } = useQuery({
    queryKey: ['saved-ipis', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('saved_ipis')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as SavedIPI[];
    },
    enabled: !!user,
  });

  const saveMutation = useMutation({
    mutationFn: async (items: { name: string; ipiNumber: string; type: string }[]) => {
      if (!user) throw new Error('Must be logged in to save IPIs');
      
      const { error } = await supabase.from('saved_ipis').insert(
        items.map((item) => ({
          name: item.name,
          ipi_number: item.ipiNumber,
          type: item.type,
          user_id: user.id,
        }))
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-ipis', user?.id] });
      toast({ title: 'Saved', description: 'IPIs saved to your collection' });
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
      queryClient.invalidateQueries({ queryKey: ['saved-ipis', user?.id] });
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
