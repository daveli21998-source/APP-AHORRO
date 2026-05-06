import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://hbqefylulydnsulfbbta.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhicWVmeWx1bHlkbnN1bGZiYnRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTEzNDYsImV4cCI6MjA5MDA4NzM0Nn0.DGa9UZN8pVilHGpyxo_gg4vg8ecPMmUnFQ0yN2hLzYE'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
