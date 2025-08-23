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
  private useTestMode: boolean;
  private testVerificationCode: string = '123456'; // Default test verification code
  private testVerifications: Map<string, string> = new Map(); // Map of phone number to verification SID

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID || 'AC6273eee1f2cd0ee04e1c7d3bb2012d01';
    const authToken = process.env.TWILIO_AUTH_TOKEN || '15f031d0cadae20cf9aa3048af197d9d';
    this.verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID || 'VAf28468c7c6ea8cba5b1ada91b8dd4495';
    this.useTestMode = process.env.TWILIO_TEST_MODE === 'true' || true;  

    if (!accountSid || !authToken || !this.verifyServiceSid) {
      throw new Error('Missing Twilio configuration. Please check your environment variables.');
    }

    this.client = new Twilio(accountSid, authToken);
    console.log(`🔧 Twilio service initialized successfully (Mode: ${this.useTestMode ? 'TEST' : 'PRODUCTION'})`);
    if (this.useTestMode) {
      console.log(`🧪 Test mode enabled. All verification codes will be: ${this.testVerificationCode}`);
    }
  }

  async sendVerificationCode(phoneNumber: string): Promise<string> {
    try {
      const formattedPhone = TwilioService.formatTunisianPhoneNumber(phoneNumber);
      console.log(`📱 Sending SMS verification to: ${formattedPhone}`);

      // Use test mode to bypass actual SMS sending
      if (this.useTestMode) {
        const testSid = `TEST-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        this.testVerifications.set(formattedPhone, testSid);
        console.log(`🧪 TEST MODE: Generated verification SID: ${testSid} for ${formattedPhone}`);
        console.log(`🧪 TEST MODE: Verification code is: ${this.testVerificationCode}`);
        return testSid;
      }

      // Real Twilio API call (only used in production mode)
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

      // Use test mode to bypass actual verification
      if (this.useTestMode) {
        const testSid = this.testVerifications.get(formattedPhone);
        if (!testSid) {
          throw new Error('No verification found for this phone number');
        }

        const isValid = code === this.testVerificationCode;
        console.log(`🧪 TEST MODE: Verification ${isValid ? 'successful' : 'failed'} for ${formattedPhone}`);
        
        return {
          sid: testSid,
          status: isValid ? 'approved' : 'denied',
          to: formattedPhone,
          channel: 'sms',
          valid: isValid
        };
      }

      // Real Twilio API call (only used in production mode)
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
      if (this.useTestMode) {
        console.log('🧪 Twilio service test successful (TEST MODE)');
        return true;
      }
      
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

// Export convenience function for sending SMS
export const sendSMS = async (phoneNumber: string, message: string): Promise<void> => {
  try {
    const formattedPhone = TwilioService.formatTunisianPhoneNumber(phoneNumber);
    console.log(`📱 Sending SMS to: ${formattedPhone}`);

    if (process.env.TWILIO_TEST_MODE === 'true' || true) {
      console.log(`🧪 TEST MODE: SMS would be sent to ${formattedPhone}: ${message}`);
      return;
    }

    // Real SMS sending (only in production)
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      throw new Error('Missing Twilio SMS configuration');
    }

    const { Twilio } = require('twilio');
    const client = new Twilio(accountSid, authToken);

    await client.messages.create({
      body: message,
      from: fromNumber,
      to: formattedPhone
    });

    console.log(`✅ SMS sent successfully to ${formattedPhone}`);
  } catch (error: any) {
    console.error('❌ Error sending SMS:', error.message);
    throw new Error(`Failed to send SMS: ${error.message}`);
  }
};

export { TwilioService };
export type { TwilioVerificationResult, TwilioVerificationStatus }; 