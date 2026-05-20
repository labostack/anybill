/**
 * @module controllers/admin/SettingsController
 *
 * Account and checkout configuration endpoints (admin dashboard).
 */

import { Controller, Get, Put, BodyParams, UseBefore } from "@tsed/common";
import { BadRequest } from "@tsed/exceptions";
import { Tags, Summary, Description, Returns } from "@tsed/schema";
import { AdminGuard } from "../../core/AdminGuard";
import { AppDataSource } from "../../core/datasource";
import { Account } from "../../entities/Account";
import { hashPassword, comparePassword } from "../../core/auth";
import { BillingService } from "../../services/BillingService";
import { ChangePasswordBody } from "../../models/AuthModels";
import { UpdateCheckoutSettingsBody } from "../../models/SettingsModels";

@Controller("/settings")
@UseBefore(AdminGuard)
@Tags("Settings")

export class SettingsController {
    constructor(private readonly billing: BillingService) {}

    private async getAccount(): Promise<Account> {
        return AppDataSource.getRepository(Account).findOneOrFail({ where: {} });
    }

    @Get("/")
    @Summary("Get account settings")
    @Description("Returns the current account email, checkout configuration, and success redirect URL.")
    @Returns(200)
    async get() {
        const account = await this.getAccount();
        return {
            email: account.email,
            checkoutConfig: account.checkoutConfig,
            successRedirectUrl: account.successRedirectUrl,
        };
    }

    @Put("/password")
    @Summary("Change password")
    @Description("Changes the admin password. Requires the current password for verification.")
    @Returns(200)
    @Returns(400)
    async changePassword(@BodyParams() data: ChangePasswordBody) {
        if (data.newPassword !== data.confirmPassword) {
            throw new BadRequest("Passwords do not match");
        }

        const account = await this.getAccount();
        if (!comparePassword(data.currentPassword, account.passwordHash)) {
            throw new BadRequest("Current password is incorrect");
        }

        account.passwordHash = hashPassword(data.newPassword);
        await AppDataSource.getRepository(Account).save(account);
        return { success: true };
    }

    @Put("/checkout")
    @Summary("Update checkout settings")
    @Description("Updates checkout page branding (logo, colors) and the success redirect URL.")
    @Returns(200)
    async updateCheckout(@BodyParams() data: UpdateCheckoutSettingsBody) {

        const account = await this.getAccount();
        if (data.checkoutConfig !== undefined) account.checkoutConfig = data.checkoutConfig;
        if (data.successRedirectUrl !== undefined) account.successRedirectUrl = data.successRedirectUrl;
        await AppDataSource.getRepository(Account).save(account);
        return { success: true };
    }

    @Get("/providers")
    @Summary("List providers")
    @Description("Returns the names of all loaded payment provider plugins.")
    @Returns(200)
    async providers() {
        return { providers: this.billing.getProviderNames() };
    }
}
