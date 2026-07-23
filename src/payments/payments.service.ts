import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EnrollmentService } from '../enrollment/enrollment.service';
import { RazorpayService } from './razorpay.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpay: RazorpayService,
    private readonly enrollment: EnrollmentService,
  ) {}

  // ------------------------------------------------------------- Checkout
  async checkout(user: AuthUser, courseId: string) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: { id: true, title: true, priceCents: true, currency: true, status: true },
    });
    if (!course) throw new NotFoundException('Course not found.');
    if (course.status !== 'published') {
      throw new BadRequestException('This course is not open for enrollment.');
    }
    if (course.priceCents <= 0) {
      throw new BadRequestException('This course is free — use the enroll endpoint.');
    }

    const already = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.sub, courseId } },
    });
    if (already) throw new ConflictException('You are already enrolled in this course.');

    // Internal pending order first, then a Razorpay order referencing it.
    const order = await this.prisma.order.create({
      data: {
        userId: user.sub,
        status: 'pending',
        totalCents: course.priceCents,
        currency: course.currency,
        provider: 'razorpay',
        items: { create: { courseId: course.id, priceCents: course.priceCents } },
      },
    });

    const rzpOrder = await this.razorpay.createOrder(
      course.priceCents,
      course.currency,
      order.id,
    );
    await this.prisma.order.update({
      where: { id: order.id },
      data: { providerOrderId: rzpOrder.id },
    });

    return {
      orderId: order.id,
      razorpayOrderId: rzpOrder.id,
      amount: course.priceCents,
      currency: course.currency,
      keyId: this.razorpay.keyId,
      mode: this.razorpay.isLive ? 'live' : 'test',
      course: { id: course.id, title: course.title },
    };
  }

  // -------------------------------------------------- Verify (client callback)
  async verifyAndComplete(
    user: AuthUser,
    dto: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
  ) {
    const valid = this.razorpay.verifyPaymentSignature(
      dto.razorpayOrderId,
      dto.razorpayPaymentId,
      dto.razorpaySignature,
    );
    if (!valid) throw new BadRequestException('Invalid payment signature.');

    const order = await this.prisma.order.findUnique({
      where: { providerOrderId: dto.razorpayOrderId },
    });
    if (!order) throw new NotFoundException('Order not found.');
    if (order.userId !== user.sub) throw new ForbiddenException('Not your order.');

    return this.fulfill(dto.razorpayOrderId, dto.razorpayPaymentId);
  }

  // ------------------------------------------------------------- Webhook
  async handleWebhook(rawBody: Buffer, signature: string | undefined) {
    if (!signature || !this.razorpay.verifyWebhookSignature(rawBody, signature)) {
      throw new BadRequestException('Invalid webhook signature.');
    }
    const event = JSON.parse(rawBody.toString('utf8')) as {
      event: string;
      payload?: { payment?: { entity?: { id: string; order_id: string } } };
    };

    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const payment = event.payload?.payment?.entity;
      if (payment?.order_id && payment.id) {
        // Idempotency via webhook_events.
        try {
          await this.prisma.webhookEvent.create({
            data: { provider: 'razorpay', eventId: payment.id, payload: event as object },
          });
        } catch {
          this.logger.log(`Duplicate webhook ${payment.id} ignored.`);
          return { received: true, duplicate: true };
        }
        await this.fulfill(payment.order_id, payment.id);
      }
    }
    return { received: true };
  }

  // ------------------------------------------------------------- Fulfilment
  /** Idempotent: records payment, marks order paid, grants enrollment(s). */
  private async fulfill(providerOrderId: string, providerPaymentId: string) {
    const order = await this.prisma.order.findUnique({
      where: { providerOrderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found.');

    const existingPayment = await this.prisma.payment.findFirst({
      where: { provider: 'razorpay', providerPaymentId },
    });

    if (order.status !== 'paid') {
      await this.prisma.$transaction([
        ...(existingPayment
          ? []
          : [
              this.prisma.payment.create({
                data: {
                  orderId: order.id,
                  provider: 'razorpay',
                  providerPaymentId,
                  amountCents: order.totalCents,
                  status: 'succeeded',
                },
              }),
            ]),
        this.prisma.order.update({ where: { id: order.id }, data: { status: 'paid' } }),
      ]);
    }

    const enrollments = [];
    for (const item of order.items) {
      enrollments.push(await this.enrollment.fulfillPurchase(order.userId, item.courseId));
    }
    return { orderId: order.id, status: 'paid', enrollments };
  }

  // --------------------------------------------------------------- History
  async myOrders(user: AuthUser) {
    const orders = await this.prisma.order.findMany({
      where: { userId: user.sub },
      orderBy: { createdAt: 'desc' },
      include: {
        items: { include: { course: { select: { title: true, slug: true } } } },
        payments: { select: { provider: true, status: true, amountCents: true } },
      },
    });
    return orders.map((o) => ({
      id: o.id,
      status: o.status,
      totalCents: o.totalCents,
      currency: o.currency,
      createdAt: o.createdAt,
      items: o.items.map((i) => ({ course: i.course.title, priceCents: i.priceCents })),
      payment: o.payments[0] ?? null,
    }));
  }
}
