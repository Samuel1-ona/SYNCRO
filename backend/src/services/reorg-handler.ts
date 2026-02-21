import logger from '../config/logger';
import { supabase } from '../config/database';

export class ReorgHandler {
  private reorgDepth: number = 10; // Safety margin for reorgs

  async handleReorg(newLedger: number, oldLedger: number) {
    if (newLedger <= oldLedger) {
      logger.warn('Potential reorg detected', { newLedger, oldLedger });
      await this.rollbackEvents(newLedger);
    }
  }

  private async rollbackEvents(fromLedger: number) {
    const safePoint = fromLedger - this.reorgDepth;
    
    // Get affected events
    const { data: events } = await supabase
      .from('contract_events')
      .select('*')
      .gte('ledger', safePoint);

    if (!events || events.length === 0) return;

    logger.info('Rolling back events', { count: events.length, fromLedger: safePoint });

    // Revert subscription states
    for (const event of events) {
      await this.revertEvent(event);
    }

    // Delete rolled back events
    await supabase
      .from('contract_events')
      .delete()
      .gte('ledger', safePoint);

    // Update cursor
    await supabase
      .from('event_cursor')
      .update({ last_ledger: safePoint - 1 })
      .eq('id', 1);

    logger.info('Reorg handled', { rolledBackTo: safePoint });
  }

  private async revertEvent(event: any) {
    const { sub_id, event_type } = event;

    switch (event_type) {
      case 'renewal_success':
        await supabase
          .from('subscriptions')
          .update({ status: 'pending', last_renewal_cycle_id: null })
          .eq('blockchain_sub_id', sub_id);
        break;

      case 'duplicate_renewal_rejected':
        // No-op: rejection didn't change state, rollback is a no-op
        break;

      case 'state_transition':
        // Fetch previous state from earlier events
        const { data: prevEvent } = await supabase
          .from('contract_events')
          .select('event_data')
          .eq('sub_id', sub_id)
          .lt('ledger', event.ledger)
          .order('ledger', { ascending: false })
          .limit(1)
          .single();

        if (prevEvent) {
          await supabase
            .from('subscriptions')
            .update({ status: prevEvent.event_data.new_state?.toLowerCase() || 'active' })
            .eq('blockchain_sub_id', sub_id);
        }
        break;

      case 'approval_created':
        await supabase
          .from('renewal_approvals')
          .delete()
          .eq('blockchain_sub_id', sub_id)
          .eq('approval_id', event.event_data.approval_id);
        break;
    }
  }
}

export const reorgHandler = new ReorgHandler();
