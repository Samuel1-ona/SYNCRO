-- Create subscription_gift_cards table for gift card attachments
CREATE TABLE IF NOT EXISTS public.subscription_gift_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gift_card_hash text NOT NULL,
  provider text NOT NULL,
  transaction_hash text,
  status text NOT NULL DEFAULT 'attached' CHECK (status IN ('attached', 'redeemed', 'expired')),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(subscription_id, gift_card_hash)
);

-- Enable RLS
ALTER TABLE public.subscription_gift_cards ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "subscription_gift_cards_select_own"
  ON public.subscription_gift_cards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "subscription_gift_cards_insert_own"
  ON public.subscription_gift_cards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "subscription_gift_cards_update_own"
  ON public.subscription_gift_cards FOR UPDATE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS subscription_gift_cards_subscription_id_idx ON public.subscription_gift_cards(subscription_id);
CREATE INDEX IF NOT EXISTS subscription_gift_cards_user_id_idx ON public.subscription_gift_cards(user_id);
CREATE INDEX IF NOT EXISTS subscription_gift_cards_gift_card_hash_idx ON public.subscription_gift_cards(gift_card_hash);
