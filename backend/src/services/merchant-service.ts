import { supabase } from '../config/database';
import logger from '../config/logger';
import type { Merchant, MerchantCreateInput, MerchantUpdateInput } from '../types/merchant';

export class MerchantService {
    async createMerchant(input: MerchantCreateInput): Promise<Merchant> {
        const { data: merchant, error } = await supabase
            .from('merchants')
            .insert({
                name: input.name,
                logo_url: input.logo_url || null,
                category: input.category || null,
                cancellation_url: input.cancellation_url || null,
                gift_card_supported: input.gift_card_supported || false,
            })
            .select()
            .single();

        if (error) {
            logger.error('Failed to create merchant:', error);
            throw new Error(`Failed to create merchant: ${error.message}`);
        }

        return merchant;
    }

    async updateMerchant(merchantId: string, input: MerchantUpdateInput): Promise<Merchant> {
        const updateData: any = {
            ...input,
            updated_at: new Date().toISOString(),
        };

        // Remove undefined fields
        Object.keys(updateData).forEach(
            (key) => updateData[key] === undefined && delete updateData[key]
        );

        const { data: merchant, error } = await supabase
            .from('merchants')
            .update(updateData)
            .eq('merchant_id', merchantId)
            .select()
            .single();

        if (error) {
            logger.error('Failed to update merchant:', error);
            throw new Error(`Failed to update merchant: ${error.message}`);
        }

        if (!merchant) {
            throw new Error('Merchant not found');
        }

        return merchant;
    }

    async deleteMerchant(merchantId: string): Promise<void> {
        const { error } = await supabase
            .from('merchants')
            .delete()
            .eq('merchant_id', merchantId);

        if (error) {
            logger.error('Failed to delete merchant:', error);
            throw new Error(`Failed to delete merchant: ${error.message}`);
        }
    }

    async getMerchant(merchantId: string): Promise<Merchant> {
        const { data: merchant, error } = await supabase
            .from('merchants')
            .select('*')
            .eq('merchant_id', merchantId)
            .single();

        if (error) {
            logger.error('Failed to get merchant:', error);
            throw new Error(`Failed to get merchant: ${error.message}`);
        }

        if (!merchant) {
            throw new Error('Merchant not found');
        }

        return merchant;
    }

    async listMerchants(options: { limit?: number; offset?: number; category?: string } = {}): Promise<{ merchants: Merchant[]; total: number }> {
        let query = supabase
            .from('merchants')
            .select('*', { count: 'exact' })
            .order('name', { ascending: true });

        if (options.category) {
            query = query.eq('category', options.category);
        }

        if (options.limit) {
            query = query.limit(options.limit);
        }

        if (options.offset) {
            query = query.range(
                options.offset,
                options.offset + (options.limit || 10) - 1
            );
        }

        const { data: merchants, error, count } = await query;

        if (error) {
            logger.error('Failed to list merchants:', error);
            throw new Error(`Failed to list merchants: ${error.message}`);
        }

        return {
            merchants: merchants || [],
            total: count || 0,
        };
    }
}

export const merchantService = new MerchantService();
