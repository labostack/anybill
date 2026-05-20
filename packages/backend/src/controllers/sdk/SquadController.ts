/**
 * @module controllers/sdk/SquadController
 *
 * Squad management endpoints for the SDK API.
 *
 * Provides squad CRUD, member management, and access checking.
 * Protected by API key authentication via the {@link SdkGuard}.
 */

import { Controller, Get, Post, Delete, BodyParams, PathParams, QueryParams, UseBefore } from "@tsed/common";
import { Tags, Summary, Description, Returns } from "@tsed/schema";
import { SdkGuard } from "../../core/SdkGuard";
import { SquadService } from "../../services/SquadService";
import { CreateSquadBody, AddSquadMemberBody } from "../../models/SquadModels";

@Controller("/")
@UseBefore(SdkGuard)
@Tags("Squads")

export class SquadController {
    constructor(private readonly squadService: SquadService) {}

    /** Create a squad for a subscriber. */
    @Post("/squads")
    @Summary("Create squad")
    @Description("Creates a squad for a subscriber. The subscription plan must have squads enabled.")
    @Returns(201)
    @Returns(400)
    @Returns(404)
    @Returns(409)
    async createSquad(@BodyParams() body: CreateSquadBody) {
        return this.squadService.createSquad(body.subscriberId);
    }

    /** Get a squad by ID with its active members. */
    @Get("/squads/:id")
    @Summary("Get squad")
    @Description("Returns a squad with its owner and active members.")
    @Returns(200)
    @Returns(404)
    async getSquad(@PathParams("id") id: string) {
        return this.squadService.getSquad(id);
    }

    /** Find a squad by owner's external user ID. */
    @Get("/squads")
    @Summary("Find squad by owner")
    @Description("Finds a squad by the owner's external user ID and subscription plan.")
    @Returns(200)
    async findSquad(
        @QueryParams("owner_uid") ownerUid: string,
        @QueryParams("subscription_id") subscriptionId: string,
    ) {
        if (!ownerUid || !subscriptionId) {
            return [];
        }
        const squad = await this.squadService.getSquadByOwnerUid(ownerUid, subscriptionId);
        return squad ? [squad] : [];
    }

    /** Dissolve a squad, removing all members. */
    @Delete("/squads/:id")
    @Summary("Dissolve squad")
    @Description("Dissolves a squad, soft-deleting all members and removing the squad.")
    @Returns(200)
    @Returns(404)
    async dissolveSquad(@PathParams("id") id: string) {
        await this.squadService.dissolveSquad(id);
        return { dissolved: true };
    }

    /** Add a member to a squad. */
    @Post("/squads/:id/members")
    @Summary("Add squad member")
    @Description("Adds a user to a squad by their external user ID. Validates member limits and uniqueness.")
    @Returns(201)
    @Returns(400)
    @Returns(404)
    @Returns(409)
    async addMember(
        @PathParams("id") id: string,
        @BodyParams() body: AddSquadMemberBody,
    ) {
        return this.squadService.addMember(id, body.uid);
    }

    /** Remove a member from a squad. */
    @Delete("/squads/:id/members/:uid")
    @Summary("Remove squad member")
    @Description("Removes a member from a squad by their external user ID (soft-delete).")
    @Returns(200)
    @Returns(404)
    async removeMember(
        @PathParams("id") id: string,
        @PathParams("uid") uid: string,
    ) {
        await this.squadService.removeMember(id, uid);
        return { removed: true };
    }

    /** List active members of a squad. */
    @Get("/squads/:id/members")
    @Summary("List squad members")
    @Description("Returns all active members of a squad.")
    @Returns(200)
    @Returns(404)
    async getMembers(@PathParams("id") id: string) {
        return this.squadService.getMembers(id);
    }

    /**
     * Check if a user has access — directly or through a squad.
     *
     * This is the primary endpoint for client applications to verify
     * user access to a subscription.
     */
    @Get("/access")
    @Summary("Check user access")
    @Description("Checks if a user has access to a subscription — either directly or through a squad membership.")
    @Returns(200)
    async checkAccess(
        @QueryParams("uid") uid: string,
        @QueryParams("subscription_id") subscriptionId?: string,
    ) {
        return this.squadService.checkAccess(uid, subscriptionId);
    }
}
