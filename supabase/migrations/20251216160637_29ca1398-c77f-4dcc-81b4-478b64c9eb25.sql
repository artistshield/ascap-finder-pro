-- Create table for saved IPIs (no auth, shared collection)
CREATE TABLE public.saved_ipis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  ipi_number TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('writer', 'publisher', 'performer')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS but allow public access (no auth required)
ALTER TABLE public.saved_ipis ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read saved IPIs
CREATE POLICY "Anyone can view saved IPIs"
ON public.saved_ipis
FOR SELECT
USING (true);

-- Allow anyone to insert saved IPIs
CREATE POLICY "Anyone can insert saved IPIs"
ON public.saved_ipis
FOR INSERT
WITH CHECK (true);

-- Allow anyone to delete saved IPIs
CREATE POLICY "Anyone can delete saved IPIs"
ON public.saved_ipis
FOR DELETE
USING (true);

-- Create index for faster queries
CREATE INDEX idx_saved_ipis_type ON public.saved_ipis(type);
CREATE INDEX idx_saved_ipis_name ON public.saved_ipis(name);