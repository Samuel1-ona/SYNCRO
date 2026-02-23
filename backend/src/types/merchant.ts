export interface Merchant {
  merchant_id: string;
  name: string;
  logo_url: string | null;
  category: string | null;
  cancellation_url: string | null;
  gift_card_supported: boolean;
  created_at: string;
  updated_at: string;
}

export interface MerchantCreateInput {
  name: string;
  logo_url?: string;
  category?: string;
  cancellation_url?: string;
  gift_card_supported?: boolean;
}

export interface MerchantUpdateInput {
  name?: string;
  logo_url?: string;
  category?: string;
  cancellation_url?: string;
  gift_card_supported?: boolean;
}
