import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gjrujyfhttnacjcljsje.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqcnVqeWZodHRuYWNqY2xqc2plIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0OTk5MDMsImV4cCI6MjA5NDA3NTkwM30.tw0LsLwNbMHcB6qzSuzl35OkF_RS8KZxTf4Zh5XCv1U';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
