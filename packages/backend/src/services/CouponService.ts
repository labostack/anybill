/**
 * @module services/CouponService
 *
 * Service for validating and applying discount coupons.
 *
 * Handles coupon validation (active, expiry, limits, plan match,
 * currency match, per-user usage), discount calculation, and
 * redemption tracking.
 */

import { Injectable, Inject } from "@tsed/di";
import { Logger } from "@tsed/logger";
import { AppDataSource } from "../core/datasource";
import { ErrorCode } from "../core/errors/ErrorCode";
import { Coupon } from "../entities/Coupon";
import { Invoice } from "../entities/Invoice";
import { Subscription } from "../entities/Subscription";

@Injectable()
export class CouponService {
    @Inject()
    logger!: Logger;

    /**
     * Validate a coupon code for a given subscription and user.
     *
     * Checks: isActive, expiry, maxRedemptions, perUser limit,
     * subscriptionIds, currency match, minAmount.
     *
     * @param code           - Coupon code (case-insensitive).
     * @param subscriptionId - Target subscription plan ID.
     * @param uid            - External user identifier.
     * @returns Validation result with the coupon (if valid) or an error message.
     */
    async validateCoupon(
        code: string,
        subscriptionId?: string,
        uid?: string,
    ): Promise<{ valid: boolean; error?: string; errorCode?: ErrorCode; coupon?: Coupon }> {
        const coupon = await AppDataSource.getRepository(Coupon).findOne({
            where: { code: code.toUpperCase() },
        });

        if (!coupon) return { valid: false, errorCode: ErrorCode.COUPON_NOT_FOUND, error: "Coupon not found" };

        // 1. Check active status
        if (!coupon.isActive) return { valid: false, errorCode: ErrorCode.COUPON_INACTIVE, error: "Coupon is inactive" };

        // 2. Check expiration
        if (coupon.expiresAt && coupon.expiresAt < new Date()) {
            return { valid: false, errorCode: ErrorCode.COUPON_EXPIRED, error: "Coupon has expired" };
        }

        // 3. Check overall usage limit
        if (coupon.maxRedemptions !== null && coupon.timesRedeemed >= coupon.maxRedemptions) {
            return { valid: false, errorCode: ErrorCode.COUPON_USAGE_LIMIT, error: "Coupon usage limit reached" };
        }

        // 4. Validate subscription constraints (if subscription is known at this point)
        if (subscriptionId) {
            const subscription = await AppDataSource.getRepository(Subscription).findOneBy({ id: subscriptionId });
            if (!subscription) return { valid: false, errorCode: ErrorCode.SUBSCRIPTION_NOT_FOUND, error: "Subscription not found" };

            // For fixed coupons, currency MUST match exactly
            if (coupon.type === "fixed" && coupon.currency !== subscription.currency) {
                return { valid: false, errorCode: ErrorCode.COUPON_CURRENCY_MISMATCH, error: "Coupon currency does not match" };
            }

            // For minAmount constraint
            if (coupon.minAmount > 0 && subscription.amount < coupon.minAmount) {
                return { valid: false, errorCode: ErrorCode.COUPON_MIN_AMOUNT, error: "Order does not meet minimum amount" };
            }

            // Check if coupon is restricted to specific plans
            if (coupon.subscriptionIds && coupon.subscriptionIds.length > 0) {
                if (!coupon.subscriptionIds.includes(subscriptionId)) {
                    return { valid: false, errorCode: ErrorCode.COUPON_INVALID_PLAN, error: "Coupon not valid for this plan" };
                }
            }
        }

        // 5. Validate per-user limits (if user is known, i.e., during actual payment/application)
        if (uid && coupon.maxRedemptionsPerUser !== null) {
            const userInvoicesWithCoupon = await AppDataSource.getRepository(Invoice)
                .createQueryBuilder("invoice")
                .innerJoin("invoice.subscriber", "subscriber")
                .where("invoice.couponId = :couponId", { couponId: coupon.id })
                .andWhere("subscriber.uid = :uid", { uid })
                .andWhere("invoice.status IN (:...statuses)", { statuses: ["paid"] })
                .getCount();

            if (userInvoicesWithCoupon >= coupon.maxRedemptionsPerUser) {
                return { valid: false, errorCode: ErrorCode.COUPON_ALREADY_USED, error: "You have already used this coupon" };
            }
        }

        return { valid: true, coupon };
    }

    /**
     * Calculate discount amount for a coupon.
     *
     * For percent: `Math.round(amount * coupon.value / 100)`.
     * For fixed: `coupon.value`.
     * Discount cannot exceed the original amount.
     *
     * @param coupon - The validated coupon.
     * @param amount - Original amount in minor units.
     * @returns Discount and final amounts.
     */
    calculateDiscount(coupon: Coupon, amount: number): { discountAmount: number; finalAmount: number } {
        let discountAmount: number;

        if (coupon.type === "percent") {
            discountAmount = Math.round(amount * coupon.value / 100);
        } else {
            discountAmount = coupon.value;
        }

        // Discount cannot exceed the original amount.
        discountAmount = Math.min(discountAmount, amount);

        return {
            discountAmount,
            finalAmount: amount - discountAmount,
        };
    }

    /**
     * Increment timesRedeemed on the coupon.
     *
     * @param couponId - ID of the coupon to mark as redeemed.
     */
    async redeemCoupon(couponId: string): Promise<void> {
        const couponRepo = AppDataSource.getRepository(Coupon);
        await couponRepo
            .createQueryBuilder()
            .update(Coupon)
            .set({ timesRedeemed: () => "timesRedeemed + 1" })
            .where("id = :id", { id: couponId })
            .execute();
    }
}
