import { userPreferenceService } from '../src/services/user-preference-service';
import { supabase } from '../src/config/database';
import logger from '../src/config/logger';

// Mock logger to avoid noise
jest.mock('../src/config/logger');

// Mock Supabase client
jest.mock('../src/config/database', () => {
    const mockSupabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        upsert: jest.fn().mockReturnThis(),
        single: jest.fn(),
    };
    return { supabase: mockSupabase };
});

describe('UserPreferenceService', () => {
    const testUserId = '00000000-0000-0000-0000-000000000000';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return default preferences if user has no preferences set', async () => {
        (supabase.from as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: null, error: null }),
        });

        const prefs = await userPreferenceService.getPreferences(testUserId);
        expect(prefs.user_id).toBe(testUserId);
        expect(prefs.notification_channels).toEqual(['email']);
        expect(prefs.reminder_timing).toEqual([7, 3, 1]);
        expect(prefs.email_opt_ins.reminders).toBe(true);
    });

    it('should partially update preferences and merge with existing ones', async () => {
        const defaultPrefs = {
            user_id: testUserId,
            notification_channels: ['email'],
            reminder_timing: [7, 3, 1],
            email_opt_ins: { marketing: false, reminders: true, updates: true },
            automation_flags: { auto_renew: false, auto_retry: true },
        };

        // First call (getPreferences inside updatePreferences) returns null/default
        // Subsequent calls return the updated data
        (supabase.from as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            upsert: jest.fn().mockReturnThis(),
            single: jest.fn()
                .mockResolvedValueOnce({ data: null, error: null }) // initial get
                .mockResolvedValueOnce({ // upsert select single
                    data: {
                        ...defaultPrefs,
                        notification_channels: ['email', 'push'],
                        email_opt_ins: { marketing: true, reminders: true, updates: true },
                    },
                    error: null
                })
                .mockResolvedValue({ // final get
                    data: {
                        ...defaultPrefs,
                        notification_channels: ['email', 'push'],
                        email_opt_ins: { marketing: true, reminders: true, updates: true },
                    },
                    error: null
                }),
        });

        // Perform partial update
        await userPreferenceService.updatePreferences(testUserId, {
            notification_channels: ['email', 'push'],
            email_opt_ins: { marketing: true } as any
        });

        const prefs = await userPreferenceService.getPreferences(testUserId);
        expect(prefs.notification_channels).toEqual(['email', 'push']);
        expect(prefs.email_opt_ins.marketing).toBe(true);
        expect(prefs.email_opt_ins.reminders).toBe(true);
    });

    it('should handle deep merge for automation flags', async () => {
        const defaultPrefs = {
            user_id: testUserId,
            notification_channels: ['email'],
            reminder_timing: [7, 3, 1],
            email_opt_ins: { marketing: false, reminders: true, updates: true },
            automation_flags: { auto_renew: false, auto_retry: true },
        };

        (supabase.from as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            upsert: jest.fn().mockReturnThis(),
            single: jest.fn()
                .mockResolvedValueOnce({ data: null, error: null }) // initial get
                .mockResolvedValueOnce({ // upsert select single
                    data: {
                        ...defaultPrefs,
                        automation_flags: { auto_renew: true, auto_retry: true },
                    },
                    error: null
                })
                .mockResolvedValue({ // final get
                    data: {
                        ...defaultPrefs,
                        automation_flags: { auto_renew: true, auto_retry: true },
                    },
                    error: null
                }),
        });

        await userPreferenceService.updatePreferences(testUserId, {
            automation_flags: { auto_renew: true, auto_retry: true }
        });

        const prefs = await userPreferenceService.getPreferences(testUserId);
        expect(prefs.automation_flags.auto_renew).toBe(true);
        expect(prefs.automation_flags.auto_retry).toBe(true);
    });
});
