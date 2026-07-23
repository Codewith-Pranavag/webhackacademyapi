import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Env } from '../config/env.validation';

interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
}

/**
 * Thin Razorpay adapter. When RAZORPAY_KEY_ID is set (rzp_test_/rzp_live_), it
 * calls the live Orders API; otherwise it runs in local test mode (a synthetic
 * order id) so the full checkout → verify flow is exercisable without keys.
 * Signature verification is identical in both modes.
 */
@Injectable()
export class RazorpayService {
  private readonly logger = new Logger(RazorpayService.name);
  readonly keyId: string;
  private readonly keySecret: string;
  private readonly webhookSecret: string;
  readonly isLive: boolean;

  constructor(config: ConfigService<Env, true>) {
    this.keyId = config.get('RAZORPAY_KEY_ID', { infer: true });
    this.keySecret = config.get('RAZORPAY_KEY_SECRET', { infer: true });
    this.webhookSecret = config.get('RAZORPAY_WEBHOOK_SECRET', { infer: true });
    this.isLive = /^rzp_(test|live)_/.test(this.keyId);
  }

  async createOrder(amount: number, currency: string, receipt: string): Promise<RazorpayOrder> {
    if (!this.isLive) {
      // Test mode — synthesize an order id.
      return { id: `order_test_${randomBytes(10).toString('hex')}`, amount, currency };
    }
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount, currency, receipt, payment_capture: 1 }),
    });
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Razorpay order create failed: ${res.status} ${text}`);
      throw new BadGatewayException('Payment provider error creating order.');
    }
    return (await res.json()) as RazorpayOrder;
  }

  /** Verifies the checkout callback signature: HMAC(order_id|payment_id, key_secret). */
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    const expected = createHmac('sha256', this.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    return safeEqual(expected, signature);
  }

  /** Verifies a webhook: HMAC(rawBody, webhook_secret). */
  verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
    const expected = createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');
    return safeEqual(expected, signature);
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
