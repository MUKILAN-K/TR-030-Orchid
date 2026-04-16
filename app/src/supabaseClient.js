import { createClient } from '@supabase/supabase-js'

// Using the credentials from your previous iteration
const supabaseUrl = 'https://svcxsqwgvrcpccwblipx.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2Y3hzcXdndnJjcGNjd2JsaXB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMzY0MDQsImV4cCI6MjA5MTkxMjQwNH0.cpmAezTbzKgtDKbcQft4DGlZL9VPAfUmi1M7wkObmIA'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
