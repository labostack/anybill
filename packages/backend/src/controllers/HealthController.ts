/**
 * @module controllers/HealthController
 *
 * Simple health check endpoint for container orchestrators.
 * Returns 200 with `{ status: "ok" }`.
 */

import { Controller } from "@tsed/di";
import { Get, Tags, Summary, Returns } from "@tsed/schema";

@Controller("/health")
@Tags("Health")
export class HealthController {
    @Get("/")
    @Summary("Health check")
    @Returns(200)
    check() {
        return { status: "ok" };
    }
}
