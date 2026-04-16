-- COPY AND PASTE THIS INTO YOUR SUPABASE SQL EDITOR --

-- 1. Completely drop old tables to prevent conflicts with new Auth schema
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP FUNCTION IF EXISTS public.transfer_funds;

-- 2. Create Public Users Table linked to Supabase Auth
CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  name text,
  email text UNIQUE NOT NULL,
  balance numeric DEFAULT 10000 NOT NULL,
  role text DEFAULT 'user'::text NOT NULL
);

-- 3. Create Trigger to automatically add user to public.users when they Sign Up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'name', COALESCE(new.raw_user_meta_data->>'role', 'user'));
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 4. Create Transactions Table (Using Email as identifiers)
CREATE TABLE public.transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  sender_email text REFERENCES public.users(email) NOT NULL,
  receiver_email text REFERENCES public.users(email) NOT NULL,
  amount numeric NOT NULL,
  status text DEFAULT 'completed'::text NOT NULL, -- 'completed', 'frozen', 'blocked'
  ai_fraud_score numeric,
  ai_fraud_type text,
  ai_explanation text
);

-- Enable Realtime
alter publication supabase_realtime add table public.users;
alter publication supabase_realtime add table public.transactions;

-- 5. Secure RPC function for transfers
CREATE OR REPLACE FUNCTION transfer_funds(
  p_sender_email text,
  p_receiver_email text,
  p_amount numeric,
  p_ai_fraud_score numeric,
  p_ai_fraud_type text,
  p_ai_explanation text
) RETURNS json AS $$
DECLARE
  v_sender_balance numeric;
  v_status text := 'completed';
BEGIN
  -- Check sender balance securely
  SELECT balance INTO v_sender_balance FROM public.users WHERE email = p_sender_email FOR UPDATE;
  
  IF v_sender_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- Fraud Freeze logic
  IF p_ai_fraud_score > 0.7 THEN
    v_status := 'frozen';
  ELSE
    UPDATE public.users SET balance = balance - p_amount WHERE email = p_sender_email;
    UPDATE public.users SET balance = balance + p_amount WHERE email = p_receiver_email;
  END IF;

  INSERT INTO public.transactions (sender_email, receiver_email, amount, status, ai_fraud_score, ai_fraud_type, ai_explanation)
  VALUES (p_sender_email, p_receiver_email, p_amount, v_status, p_ai_fraud_score, p_ai_fraud_type, p_ai_explanation);

  RETURN json_build_object('status', v_status, 'message', 'Transaction recorded successfully');
END;
$$ LANGUAGE plpgsql;

-- 6. Helper RPCs for the Admin Dashboard to release funds
CREATE OR REPLACE FUNCTION decrement_balance(p_email text, p_amount numeric) RETURNS void AS $$
BEGIN
  UPDATE public.users SET balance = balance - p_amount WHERE email = p_email;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_balance(p_email text, p_amount numeric) RETURNS void AS $$
BEGIN
  UPDATE public.users SET balance = balance + p_amount WHERE email = p_email;
END;
$$ LANGUAGE plpgsql;
