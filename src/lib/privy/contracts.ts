import { z } from "zod";
import { walletSchema } from "../identity/contracts";

export const privyUserIdSchema = z.string().regex(/^did:privy:[a-zA-Z0-9_-]+$/).max(200);
export const businessWalletSchema = z.object({ id: z.string().min(1).max(200), address: walletSchema }).strict();
export type BusinessWallet = z.infer<typeof businessWalletSchema>;
export const privySessionSchema = z.object({ workspaceId: z.string().uuid(), ownerWallet: walletSchema, privyUserId: privyUserIdSchema }).strict();
export const privyAccountSchema = z.object({ wallet: businessWalletSchema, session: privySessionSchema.nullable() }).strict();
export type PrivyAccount = z.infer<typeof privyAccountSchema>;
export const privyLoginInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("signin") }).strict(),
  z.object({ action: z.literal("create_workspace") }).strict(),
  z.object({ action: z.literal("link_challenge"), wallet: walletSchema }).strict(),
  z.object({ action: z.literal("link_workspace"), nonceId: z.string().uuid(), signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/) }).strict(),
]);
export const linkChallengeSchema = z.object({ id: z.string().uuid(), userId: privyUserIdSchema,
  workspaceId: z.string().uuid(), ownerWallet: walletSchema, message: z.string().min(1).max(4096),
  expiresAt: z.iso.datetime({ offset: true }), consumed: z.boolean() }).strict();

export type PrivyRepository = {
  saveWallet(userId: string, wallet: BusinessWallet): Promise<PrivyAccount>;
  account(userId: string): Promise<PrivyAccount | null>;
  createWorkspace(userId: string): Promise<PrivyAccount>;
  issueLink(userId: string, wallet: string, origin: string, chainId: number): Promise<z.infer<typeof linkChallengeSchema>>;
  findLink(userId: string, nonceId: string): Promise<z.infer<typeof linkChallengeSchema> | null>;
  completeLink(userId: string, nonceId: string): Promise<PrivyAccount>;
};
