import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull().default(''),
  photoUrl: text('photo_url').notNull().default(''),
  role: text('role').notNull().default('member'),
  subscriptionTier: text('subscription_tier').notNull().default('standard'),
  subscriptionVerified: boolean('subscription_verified').notNull().default(false),
  subscriptionVerificationStatus: text('subscription_verification_status').notNull().default('none'),
  subscriptionRequestedTier: text('subscription_requested_tier').notNull().default(''),
  subscriptionProofUrl: text('subscription_proof_url').notNull().default(''),
  subscriptionVerifiedAt: timestamp('subscription_verified_at'),
  subscriptionVerifiedBy: text('subscription_verified_by').notNull().default(''),
  statusMessage: text('status_message').notNull().default('Available'),
  signInCount: integer('sign_in_count').notNull().default(1),
  lastSignInAt: timestamp('last_sign_in_at').defaultNow().notNull(),
  lastActiveAt: timestamp('last_active_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export const siteSnapshots = pgTable(
  'site_snapshots',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    siteId: text('site_id').notNull(),
    subgroupId: text('subgroup_id').notNull(),
    siteName: text('site_name').notNull(),
    subgroupName: text('subgroup_name').notNull(),
    payloadJson: jsonb('payload_json').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  table => [
    uniqueIndex('site_snapshots_user_site_sub_idx').on(
      table.userId,
      table.siteId,
      table.subgroupId
    )
  ]
);

export const bookkeepingSnapshots = pgTable('bookkeeping_snapshots', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  siteId: text('site_id').notNull(),
  subgroupId: text('subgroup_id').notNull(),
  siteName: text('site_name').notNull(),
  subgroupName: text('subgroup_name').notNull(),
  monthKey: text('month_key').notNull(),
  workerCount: integer('worker_count').notNull().default(0),
  totalLaborCost: integer('total_labor_cost').notNull().default(0),
  totalMaterialValue: integer('total_material_value').notNull().default(0),
  totalAdvances: integer('total_advances').notNull().default(0),
  netPayable: integer('net_payable').notNull().default(0),
  exportedAt: timestamp('exported_at').defaultNow().notNull()
});

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: serial('id').primaryKey(),
    threadKey: text('thread_key').notNull(),
    senderUid: text('sender_uid').notNull(),
    recipientUid: text('recipient_uid').notNull(),
    senderName: text('sender_name').notNull().default(''),
    senderEmail: text('sender_email').notNull().default(''),
    senderPhoto: text('sender_photo').notNull().default(''),
    messageType: text('message_type').notNull().default('text'),
    body: text('body').notNull().default(''),
    attachmentName: text('attachment_name').notNull().default(''),
    attachmentMime: text('attachment_mime').notNull().default(''),
    attachmentSize: integer('attachment_size').notNull().default(0),
    attachmentData: text('attachment_data').notNull().default(''),
    replyToId: integer('reply_to_id'),
    replyToPreview: text('reply_to_preview').notNull().default(''),
    replyToSender: text('reply_to_sender').notNull().default(''),
    reactionsJson: jsonb('reactions_json').notNull().default({}),
    isPinned: boolean('is_pinned').notNull().default(false),
    isUrgent: boolean('is_urgent').notNull().default(false),
    isEdited: boolean('is_edited').notNull().default(false),
    isDeleted: boolean('is_deleted').notNull().default(false),
    readByJson: jsonb('read_by_json').notNull().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull()
  },
  table => [
    index('chat_messages_thread_created_idx').on(
      table.threadKey,
      table.createdAt
    ),
    index('chat_messages_expires_at_idx').on(table.expiresAt)
  ]
);

export const usersRelations = relations(users, ({ many }) => ({
  siteSnapshots: many(siteSnapshots),
  bookkeepingSnapshots: many(bookkeepingSnapshots)
}));

export const siteSnapshotsRelations = relations(siteSnapshots, ({ one }) => ({
  owner: one(users, {
    fields: [siteSnapshots.userId],
    references: [users.id]
  })
}));

export const bookkeepingSnapshotsRelations = relations(
  bookkeepingSnapshots,
  ({ one }) => ({
    owner: one(users, {
      fields: [bookkeepingSnapshots.userId],
      references: [users.id]
    })
  })
);
