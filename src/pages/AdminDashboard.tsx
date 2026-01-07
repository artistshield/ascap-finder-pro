import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Mic2, LogOut, Trash2, Shield, Users, Database, ArrowLeft } from 'lucide-react';

interface SavedIPI {
  id: string;
  name: string;
  ipi_number: string;
  type: string;
  user_id: string | null;
  created_at: string;
}

interface UserWithRole {
  user_id: string;
  role: string;
  created_at: string;
}

export default function AdminDashboard() {
  const { user, signOut, isAdmin, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedIPIs, setSelectedIPIs] = useState<Set<string>>(new Set());

  // Fetch all saved IPIs (admin sees everything)
  const { data: allIPIs = [], isLoading: ipisLoading } = useQuery({
    queryKey: ['admin-all-ipis'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('saved_ipis')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as SavedIPI[];
    },
    enabled: isAdmin,
  });

  // Fetch all user roles
  const { data: userRoles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ['admin-user-roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as UserWithRole[];
    },
    enabled: isAdmin,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('saved_ipis').delete().in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-all-ipis'] });
      setSelectedIPIs(new Set());
      toast({ title: 'Deleted', description: 'Selected IPIs have been removed' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const handleDeleteSelected = () => {
    if (selectedIPIs.size === 0) return;
    deleteMutation.mutate(Array.from(selectedIPIs));
  };

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedIPIs);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIPIs(newSelection);
  };

  const toggleAll = () => {
    if (selectedIPIs.size === allIPIs.length) {
      setSelectedIPIs(new Set());
    } else {
      setSelectedIPIs(new Set(allIPIs.map(ipi => ipi.id)));
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    navigate('/');
    return null;
  }

  const uniqueUsers = new Set(allIPIs.map(ipi => ipi.user_id).filter(Boolean));
  const adminCount = userRoles.filter(r => r.role === 'admin').length;

  return (
    <div className="min-h-screen bg-background waveform-bg">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive flex items-center justify-center">
                <Shield className="h-5 w-5 text-destructive-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Admin Dashboard</h1>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate('/')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to App
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Stats Cards */}
        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Database className="h-4 w-4" />
                Total IPIs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{allIPIs.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" />
                Active Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{uniqueUsers.size}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Admins
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{adminCount}</p>
            </CardContent>
          </Card>
        </div>

        {/* All IPIs Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>All Saved IPIs</CardTitle>
                <CardDescription>Complete database of all user-saved IPIs</CardDescription>
              </div>
              {selectedIPIs.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteSelected}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete {selectedIPIs.size} Selected
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {ipisLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : allIPIs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No saved IPIs in the database</p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedIPIs.size === allIPIs.length && allIPIs.length > 0}
                          onCheckedChange={toggleAll}
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>IPI Number</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>User ID</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allIPIs.map((ipi) => (
                      <TableRow key={ipi.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIPIs.has(ipi.id)}
                            onCheckedChange={() => toggleSelection(ipi.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{ipi.name}</TableCell>
                        <TableCell className="font-mono text-sm">{ipi.ipi_number}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {ipi.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {ipi.user_id ? ipi.user_id.slice(0, 8) + '...' : 'N/A'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
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

        {/* User Roles Table */}
        <Card>
          <CardHeader>
            <CardTitle>User Roles</CardTitle>
            <CardDescription>All registered users and their roles</CardDescription>
          </CardHeader>
          <CardContent>
            {rolesLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : userRoles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No user roles found</p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User ID</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Assigned</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userRoles.map((role) => (
                      <TableRow key={`${role.user_id}-${role.role}`}>
                        <TableCell className="font-mono text-sm">{role.user_id}</TableCell>
                        <TableCell>
                          <Badge variant={role.role === 'admin' ? 'destructive' : 'secondary'}>
                            {role.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(role.created_at).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
