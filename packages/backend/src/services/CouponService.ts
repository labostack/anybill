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
        subscriptionId: string,
        uid: string,
    ): Promise<{ valid: boolean; coupon?: Coupon; error?: string }> {
        const couponRepo = AppDataSource.getRepository(Coupon);

        // 1. Find coupon by code (case-insensitive: convert to uppercase)
        const coupon = await couponRepo.findOneBy({ code: code.toUpperCase() });
        if (!coupon) return { valid: false, error: "Coupon not found" };

        // 2. Check isActive
        if (!coupon.isActive) return { valid: false, error: "Coupon is inactive" };

        // 3. Check expiry
        if (coupon.expiresAt && coupon.expiresAt <= new Date()) {
            return { valid: false, error: "Coupon has expired" };
        }

        // 4. Check maxRedemptions
        if (coupon.maxRedemptions !== null && coupon.timesRedeemed >= coupon.maxRedemptions) {
            return { valid: false, error: "Coupon usage limit reached" };
        }

        // 5. Find the subscription to check currency and amount
        const subscription = await AppDataSource.getRepository(Subscription).findOneBy({ id: subscriptionId });
        if (!subscription) return { valid: false, error: "Subscription not found" };

        // 6. For fixed type: check currency match
        if (coupon.type === "fixed" && coupon.currency !== subscription.currency) {
            return { valid: false, error: "Coupon currency does not match" };
        }

        // 7. Check minAmount
        if (coupon.minAmount > 0 && subscription.amount < coupon.minAmount) {
            return { valid: false, error: "Order does not meet minimum amount" };
        }

        // 8. Check subscriptionIds restriction
        if (coupon.subscriptionIds && coupon.subscriptionIds.length > 0) {
            if (!coupon.subscriptionIds.includes(subscriptionId)) {
                return { valid: false, error: "Coupon not valid for this plan" };
            }
        }

        // 9. Check per-user usage
        const usageCount = await AppDataSource.getRepository(Invoice)
            .createQueryBuilder("invoice")
            .innerJoin("invoice.subscriber", "subscriber")
            .where("invoice.couponId = :couponId", { couponId: coupon.id })
            .andWhere("subscriber.uid = :uid", { uid })
            .andWhere("invoice.status IN (:...statuses)", { statuses: ["paid"] })
            .getCount();

        if (usageCount >= coupon.maxRedemptionsPerUser) {
            return { valid: false, error: "You have already used this coupon" };
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
