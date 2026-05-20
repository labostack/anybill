/**
 * @module controllers/admin/AuthController
 *
 * Authentication endpoints for the admin dashboard.
 *
 * Provides initial account setup, login, and initialization status check.
 * These routes are public (no JWT required).
 */

import { Controller, Post, BodyParams, Get, Res } from "@tsed/common";
import { BadRequest, Conflict } from "@tsed/exceptions";
import { Tags, Summary, Description, Returns } from "@tsed/schema";
import type { Response } from "express";
import { AppDataSource } from "../../core/datasource";
import { Account } from "../../entities/Account";
import { ApiKey } from "../../entities/ApiKey";
import { hashPassword, comparePassword, signJwt, verifyJwt, generateApiKey, hashApiKey } from "../../core/auth";
import { AuthSetupBody, AuthLoginBody } from "../../models/AuthModels";

const COOKIE_NAME = "anybill_session";
const isProduction = process.env.NODE_ENV === "production";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

function setAuthCookie(res: Response, token: string): void {
    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "strict",
        path: "/api/admin",
        maxAge: COOKIE_MAX_AGE,
    });
}

@Controller("/auth")
@Tags("Auth")
export class AuthController {
    /**
     * Initial account setup.
     *
     * Creates the admin account and a default API key. Only succeeds if
     * no account exists yet — subsequent calls return HTTP 409.
     *
     * @returns JWT token and the initial API key (shown only once).
     */
    @Post("/setup")
    @Summary("Initial account setup")
    @Description("Creates the admin account and a default API key. Only succeeds once — returns 409 if already initialized.")
    @Returns(200)
    @Returns(409)
    async setup(@BodyParams() { email, password }: AuthSetupBody, @Res() res: Response) {

        const accountRepo = AppDataSource.getRepository(Account);
        const existing = await accountRepo.count();
        if (existing > 0) {
            throw new Conflict("Account already exists. Use /login instead.");
        }

        // Create the admin account.
        const account = accountRepo.create({
            email,
            passwordHash: hashPassword(password),
        });
        await accountRepo.save(account);

        // Create the default API key (store hash, return plain text once).
        const keyValue = generateApiKey();
        const apiKeyRepo = AppDataSource.getRepository(ApiKey);
        const apiKey = apiKeyRepo.create({
            name: "Default",
            key: hashApiKey(keyValue),
            prefix: keyValue.slice(0, 11) + "...",
        });
        await apiKeyRepo.save(apiKey);

        setAuthCookie(res, signJwt({ sub: account.id }));

        return { apiKey: keyValue };
    }

    /**
     * Admin login.
     *
     * @returns JWT token.
     */
    @Post("/login")
    @Summary("Admin login")
    @Description("Authenticates with email and password. Sets an HttpOnly session cookie.")
    @Returns(200)
    @Returns(400)
    async login(@BodyParams() { email, password }: AuthLoginBody, @Res() res: Response) {

        const repo = AppDataSource.getRepository(Account);
        const account = await repo.findOneBy({ email });
        if (!account || !comparePassword(password, account.passwordHash)) {
            throw new BadRequest("Invalid credentials");
        }

        setAuthCookie(res, signJwt({ sub: account.id }));

        return { ok: true };
    }

    /**
     * Logout — clear the session cookie.
     */
    @Post("/logout")
    @Summary("Admin logout")
    @Description("Clears the session cookie.")
    @Returns(200)
    async logout(@Res() res: Response) {
        res.clearCookie(COOKIE_NAME, { path: "/api/admin" });
        return { ok: true };
    }

    /**
     * Check whether the platform has been initialized.
     *
     * Used by the admin UI to decide whether to show the setup page
     * or the login page.
     *
     * @returns `{ initialized: boolean }`
     */
    @Get("/status")
    @Summary("Check initialization status")
    @Description("Returns whether the platform has been initialized and if the current caller has a valid session.")
    @Returns(200)
    async status(@Res() res: Response) {
        const count = await AppDataSource.getRepository(Account).count();

        // Check if the caller has a valid session cookie.
        let authenticated = false;
        const cookies = (res.req.headers.cookie || "").split(";").map((c: string) => c.trim());
        const sessionCookie = cookies.find((c: string) => c.startsWith(COOKIE_NAME + "="));
        if (sessionCookie) {
            try {
                verifyJwt(sessionCookie.split("=")[1]);
                authenticated = true;
            } catch { /* expired or invalid */ }
        }

        return { initialized: count > 0, authenticated };
    }
}
