import { z } from 'zod'

// Schema for hex color codes
export const HexColorSchema = z
  .string()
  .refine((val) => /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(val), {
    message: 'Invalid hex color code',
  })

// List arguments supported by Copilot API
export type CopilotListArgs = {
  limit?: number
  nextToken?: string
}

// Schema for decrypted Copilot tokens
export const TokenSchema = z.object({
  internalUserId: z.uuid().optional(),
  workspaceId: z.string().min(1),
})
export type Token = z.infer<typeof TokenSchema>

// Response schema for `/workspace` endpoint
export const WorkspaceResponseSchema = z.object({
  id: z.string(),
  brandName: z.string().optional(),
  labels: z
    .object({
      individualTerm: z.string().optional(),
      individualTermPlural: z.string().optional(),
      groupTerm: z.string().optional(),
      groupTermPlural: z.string().optional(),
    })
    .optional(),
})
export type WorkspaceResponse = z.infer<typeof WorkspaceResponseSchema>

export const ClientResponseSchema = z.object({
  id: z.string(),
  givenName: z.string(),
  familyName: z.string(),
  email: z.string(),
  companyIds: z.array(z.uuid()).optional(),
  status: z.string(),
  avatarImageUrl: z.string().nullable(),
  fallbackColor: z.string().nullish(),
  createdAt: z.iso.datetime(),
})
export type ClientResponse = z.infer<typeof ClientResponseSchema>

export const ClientsResponseSchema = z.object({
  data: z.array(ClientResponseSchema).nullable(),
})
export type ClientsResponse = z.infer<typeof ClientsResponseSchema>

export const CompanyResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  iconImageUrl: z.string().nullable(),
  fallbackColor: z.string().nullish(),
  isPlaceholder: z.boolean(),
  customFields: z
    .object({
      email: z.string().optional(),
    })
    .optional(),
  createdAt: z.iso.datetime(),
})
export type CompanyResponse = z.infer<typeof CompanyResponseSchema>

export const CompaniesResponseSchema = z.object({
  data: z.array(CompanyResponseSchema).nullable(),
})
export type CompaniesResponse = z.infer<typeof CompaniesResponseSchema>

// Request schema for `/company` endpoint
export const CompanyCreateRequestSchema = z.object({
  name: z.string(),
  iconImageUrl: z.string().optional(),
  fallbackColor: HexColorSchema.optional(),
})
export type CompanyCreateRequest = z.infer<typeof CompanyCreateRequestSchema>

export const ClientRequestSchema = z.object({
  givenName: z.string(),
  familyName: z.string(),
  email: z.email(),
  companyId: z.uuid().optional(),
})
export type ClientRequest = z.infer<typeof ClientRequestSchema>

export const InternalUserSchema = z.object({
  id: z.uuid(),
  givenName: z.string(),
  familyName: z.string(),
  email: z.union([z.email(), z.literal('')]), // Deleted IUs can be queried, but have no email
  avatarImageUrl: z.string().optional(),
  isClientAccessLimited: z.boolean().default(false),
  companyAccessList: z.array(z.string()).nullable(),
  fallbackColor: z.string().nullish(),
  createdAt: z.iso.datetime(),
})
export type InternalUser = z.infer<typeof InternalUserSchema>

export const InternalUsersResponseSchema = z.object({
  data: z.array(InternalUserSchema),
})
export type InternalUsersResponse = z.infer<typeof InternalUsersResponseSchema>

/**
 * `senderType` field for notification payload in Copilot API
 */
export const NotificationSenderSchema = z.enum(['internalUser', 'client'])
export type NotificationSender = z.infer<typeof NotificationSenderSchema>

/**
 * Notification RequestBody schema - accepted by SDK#createNotification
 */
export const NotificationRequestBodySchema = z.object({
  senderId: z.string(),
  // New notification body schema for copilot to accomodate for multiple companies
  senderType: NotificationSenderSchema,
  senderCompanyId: z.string().optional(),
  recipientInternalUserId: z.string().optional(),
  recipientClientId: z.string().optional(),
  recipientCompanyId: z.string().optional(),
  deliveryTargets: z.object({
    inProduct: z
      .object({
        title: z.string(),
        body: z.string().optional(),
      })
      .optional(),
    email: z
      .object({
        subject: z.string(),
        header: z.string(),
        title: z.string(),
        body: z.string().optional(),
      })
      .optional(),
  }),
})
export type NotificationRequestBody = z.infer<typeof NotificationRequestBodySchema>

export const NotificationCreatedResponseSchema = z.object({
  id: z.string(),
  appId: z.uuid().optional(),
  createdAt: z.iso.datetime(),
  event: z.string().optional(),
  object: z.string().optional(),
  companyId: z.string().optional(),
  recipientInternalUserId: z.string().optional(),
  recipientClientId: z.string().optional(),
  recipientCompanyId: z.string().optional(),
  resourceId: z.string().optional(),
  senderId: z.string().optional(),
  senderType: z.string().optional(),
})
export type NotificationCreatedResponse = z.infer<typeof NotificationCreatedResponseSchema>

export const CopilotProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
})
export type CopilotProduct = z.infer<typeof CopilotProductSchema>

export const CopilotPriceSchema = z.object({
  id: z.string(),
  amount: z.number().nonnegative(),
  currency: z.string(),
  productId: z.string(),
  createdAt: z.string(),
})
export type CopilotPrice = z.infer<typeof CopilotPriceSchema>
