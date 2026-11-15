import { Controller, Get } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { OrganizationsService } from "./organizations.service.js";

@Controller({ path: "organizations", version: "1" })
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  async list(@CurrentUser() user: RequestUser) {
    return this.organizations.findForUser(user.userId);
  }
}
