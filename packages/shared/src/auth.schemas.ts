import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshDto = z.infer<typeof refreshSchema>;

/** A new restaurant signing itself up — creates a brand-new, empty organization with this person
 *  as its Org Admin. Nothing about their brands/outlets/menu is known yet; they build all of that
 *  through the normal admin screens after this. */
export const signupSchema = z.object({
  organizationName: z.string().min(2).max(120),
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export type SignupDto = z.infer<typeof signupSchema>;

/** Authenticated user's own profile + memberships, as returned by /auth/me. */
export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  memberships: SessionMembership[];
}

export interface SessionMembership {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  roleId: string;
  roleName: string;
  permissions: string[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
}
