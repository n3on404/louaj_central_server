import { Twilio } from 'twilio';

interface TwilioVerificationResult {
  success: boolean;
  sid?: string;
  error?: string;
}

interface TwilioVerificationStatus {
  sid: string;
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'canceled';
  to: string;
  channel: string;
  valid: boolean;
}

class TwilioService {
  private client: Twilio;
  private verifyServiceSid: string;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID || 'AC6273eee1f2cd0ee04e1c7d3bb2012d01';
    const authToken = process.env.TWILIO_AUTH_TOKEN || '15f031d0cadae20cf9aa3048af197d9d';
    this.verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID || 'VAf28468c7c6ea8cba5b1ada91b8dd4495';

    if (!accountSid || !authToken || !this.verifyServiceSid) {
      throw new Error('Missing Twilio configuration. Please check your environment variables.');
    }

    this.client = new Twilio(accountSid, authToken);
    console.log('🔧 Twilio service initialized successfully');
  }

  async sendVerificationCode(phoneNumber: string): Promise<string> {
    try {
      const formattedPhone = TwilioService.formatTunisianPhoneNumber(phoneNumber);
      console.log(`📱 Sending SMS verification to: ${formattedPhone}`);

      const verification = await this.client.verify.v2
        .services(this.verifyServiceSid)
        .verifications
        .create({
          to: formattedPhone,
          channel: 'sms'
        });

      console.log(`✅ SMS sent successfully. SID: ${verification.sid}`);
      return verification.sid;
    } catch (error: any) {
      console.error('❌ Error sending SMS verification:', error.message);
      throw new Error(`Failed to send SMS verification: ${error.message}`);
    }
  }

  async verifyCode(phoneNumber: string, code: string): Promise<TwilioVerificationStatus> {
    try {
      const formattedPhone = TwilioService.formatTunisianPhoneNumber(phoneNumber);
      console.log(`🔍 Verifying SMS code for: ${formattedPhone}`);

      const verification = await this.client.verify.v2
        .services(this.verifyServiceSid)
        .verificationChecks
        .create({
          to: formattedPhone,
          code: code
        });

      console.log(`📋 Verification result: ${verification.status}`);

      return {
        sid: verification.sid,
        status: verification.status as any,
        to: verification.to,
        channel: verification.channel,
        valid: verification.valid
      };
    } catch (error: any) {
      console.error('❌ Error verifying SMS code:', error);
      throw new Error(`Failed to verify SMS code: ${error.message}`);
    }
  }

  static formatTunisianPhoneNumber(phoneNumber: string): string {
    // Remove all non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    // Handle Tunisian phone numbers
    if (cleaned.startsWith('216')) {
      // Already has country code
      return `+${cleaned}`;
    } else if (cleaned.startsWith('00216')) {
      // Remove 00 prefix and add +
      return `+${cleaned.substring(2)}`;
    } else if (cleaned.length === 8) {
      // Local Tunisian number, add country code
      return `+216${cleaned}`;
    } else if (cleaned.startsWith('0') && cleaned.length === 9) {
      // Remove leading 0 and add country code
      return `+216${cleaned.substring(1)}`;
    } else {
      // Assume it's already formatted or international
      return phoneNumber.startsWith('+') ? phoneNumber : `+${cleaned}`;
    }
  }

  async testService(): Promise<boolean> {
    try {
      // Test by checking service status
      const service = await this.client.verify.v2.services(this.verifyServiceSid).fetch();
      console.log(`🧪 Twilio service test successful. Service: ${service.friendlyName}`);
      return true;
    } catch (error: any) {
      console.error('❌ Twilio service test failed:', error.message);
      return false;
    }
  }
}

// Export singleton instance
export const twilioService = new TwilioService();
export { TwilioService };
export type { TwilioVerificationResult, TwilioVerificationStatus }; 