import axios from 'axios';

interface KonnectPaymentRequest {
  receiverWalletId: string;
  token: string;
  amount: number;
  type: string;
  description: string;
  acceptedPaymentMethods: string[];
  lifespan: number;
  checkoutForm: boolean;
  addPaymentFeesToAmount: boolean;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  orderId: string;
  webhook?: string;
  theme: string;
}

interface KonnectPaymentResponse {
  payUrl: string;
  paymentRef: string;
}

interface KonnectPaymentVerificationResponse {
  payment: {
    id: string;
    status: 'completed' | 'pending';
    amountDue: number;
    reachedAmount: number;
    amount: number;
    token: string;
    convertedAmount: number;
    exchangeRate: number;
    expirationDate: string;
    shortId: string;
    link: string;
    webhook?: string;
    successUrl?: string;
    failUrl?: string;
    orderId: string;
    type: string;
    details: string;
    acceptedPaymentMethods: string[];
    receiverWallet: any;
    transactions: Array<{
      id: string;
      status: string;
      amount: number;
      [key: string]: any;
    }>;
  };
}

interface PaymentResult {
  success: boolean;
  payUrl?: string;
  paymentRef?: string;
  error?: string;
  status?: 'completed' | 'pending' | 'expired';
  amount?: number;
  orderId?: string;
  expirationDate?: string;
}

class KonnectService {
  private apiKey: string;
  private baseUrl: string;
  private receiverWalletId: string;

  constructor() {
    this.apiKey = process.env.KONNECT_API_KEY || '67476b489d4bb7dc8cdb57e7:w7GBMmJ25ALBHrdvMEaHDndw';
    this.baseUrl = process.env.KONNECT_BASE_URL || 'https://api.sandbox.konnect.network/api/v2';
    this.receiverWalletId = process.env.KONNECT_WALLET_ID || '67476b499d4bb7dc8cdb57f5'; // Set your wallet ID
    
    console.log('🔧 Konnect payment service initialized');
  }

  /**
   * Initialize payment with Konnect
   */
  async initializePayment(params: {
    amount: number; // in millimes for TND
    description: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
    email: string;
    orderId: string;
    webhook?: string;
  }): Promise<PaymentResult> {
    try {
      console.log(`💳 Initializing Konnect payment for ${params.amount} millimes`);

      const paymentData: KonnectPaymentRequest = {
        receiverWalletId: this.receiverWalletId,
        token: 'TND',
        amount: params.amount,
        type: 'immediate',
        description: params.description,
        acceptedPaymentMethods: ['bank_card'], // Only bank card as requested
        lifespan: 60, // 60 minutes expiration
        checkoutForm: false, // Don't need checkout form since we have user data
        addPaymentFeesToAmount: false,
        firstName: params.firstName,
        lastName: params.lastName,
        phoneNumber: params.phoneNumber,
        email: params.email,
        orderId: params.orderId,
        theme: 'light'
      };

      if (params.webhook) {
        paymentData.webhook = params.webhook;
      }

      const response = await axios.post<KonnectPaymentResponse>(
        `${this.baseUrl}/payments/init-payment`,
        paymentData,
        {
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`✅ Konnect payment initialized: ${response.data.paymentRef}`);

      return {
        success: true,
        payUrl: response.data.payUrl,
        paymentRef: response.data.paymentRef
      };

    } catch (error: any) {
      console.error('❌ Konnect payment initialization failed:', error.response?.data || error.message);
      
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Payment initialization failed'
      };
    }
  }

  /**
   * Convert price to millimes (TND has 1000 millimes = 1 TND)
   */
  convertToMillimes(amountInTND: number): number {
    return Math.round(amountInTND * 1000);
  }

  /**
   * Convert millimes back to TND
   */
  convertFromMillimes(amountInMillimes: number): number {
    return amountInMillimes / 1000;
  }

  /**
   * Generate clicktopay link from payment reference
   * This creates a direct payment link for bank card payments
   */
  generateClickToPayLink(paymentRef: string): string {
    // Create a direct clicktopay link using the payment reference
    return `https://gateway.sandbox.konnect.network/payment/${paymentRef}`;
  }


  async verifyPayment(paymentId: string): Promise<PaymentResult> {
    try {
      console.log(`🔍 Verifying Konnect payment: ${paymentId}`);

      const response = await axios.get<KonnectPaymentVerificationResponse>(
        `${this.baseUrl}/payments/${paymentId}`,
        {
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      const payment = response.data.payment;
      console.log(`✅ Konnect payment retrieved: ${payment.id} - Status: ${payment.status}`);

      // Check if payment has expired
      const now = new Date();
      const expirationDate = new Date(payment.expirationDate);
      const isExpired = now > expirationDate;

      if (isExpired) {
        console.log(`⏰ Payment ${payment.id} has expired`);
        return {
          success: false,
          status: 'expired',
          error: 'Payment has expired',
          expirationDate: payment.expirationDate,
          orderId: payment.orderId
        };
      }

      // Check payment status
      if (payment.status === 'completed') {
        console.log(`✅ Payment ${payment.id} completed successfully`);
        return {
          success: true,
          status: 'completed',
          paymentRef: payment.id,
          amount: payment.amount,
          orderId: payment.orderId,
          expirationDate: payment.expirationDate
        };
      } else {
        console.log(`⏳ Payment ${payment.id} is still pending`);
        return {
          success: false,
          status: 'pending',
          paymentRef: payment.id,
          amount: payment.amount,
          orderId: payment.orderId,
          expirationDate: payment.expirationDate,
          error: 'Payment is still pending'
        };
      }

    } catch (error: any) {
      console.error('❌ Konnect payment verification failed:', error.response?.data || error.message);

      // Handle 404 error specifically (payment not found)
      if (error.response?.status === 404) {
        return {
          success: false,
          error: 'Payment not found - Invalid or non-existent payment ID'
        };
      }

      // Handle 401 error (authentication)
      if (error.response?.status === 401) {
        return {
          success: false,
          error: 'Invalid authentication - Check API key'
        };
      }

      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Payment verification failed'
      };
    }
  }
}

// Export singleton instance
export const konnectService = new KonnectService();
export { KonnectService };
export type { KonnectPaymentRequest, KonnectPaymentResponse, KonnectPaymentVerificationResponse, PaymentResult };
