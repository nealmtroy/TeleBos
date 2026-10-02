export interface HelpSection {
  key: string;
  slug: string;
  titleKey: string;
  descKey: string;
  contentKeys: string[];
}

export const helpSections: HelpSection[] = [
  {
    key: "getting-started",
    slug: "getting-started",
    titleKey: "help.gettingStarted",
    descKey: "help.gettingStartedDesc",
    contentKeys: [
      "help.gettingStartedContent1",
      "help.gettingStartedContent2",
      "help.gettingStartedContent3",
      "help.gettingStartedContent4",
    ],
  },
  {
    key: "accounts",
    slug: "account-management",
    titleKey: "help.accounts",
    descKey: "help.accountsDesc",
    contentKeys: [
      "help.accountsContent1",
      "help.accountsContent2",
      "help.accountsContent3",
      "help.accountsContent4",
      "help.accountsContent5",
    ],
  },
  {
    key: "broadcast",
    slug: "broadcasting",
    titleKey: "help.broadcast",
    descKey: "help.broadcastDesc",
    contentKeys: [
      "help.broadcastContent1",
      "help.broadcastContent2",
      "help.broadcastContent3",
      "help.broadcastContent4",
      "help.broadcastContent5",
      "help.broadcastContent6",
    ],
  },
  {
    key: "auto-reply",
    slug: "auto-reply",
    titleKey: "help.autoReply",
    descKey: "help.autoReplyDesc",
    contentKeys: [
      "help.autoReplyContent1",
      "help.autoReplyContent2",
      "help.autoReplyContent3",
      "help.autoReplyContent4",
    ],
  },
  {
    key: "member-invite",
    slug: "member-invite",
    titleKey: "help.memberInvite",
    descKey: "help.memberInviteDesc",
    contentKeys: [
      "help.memberInviteContent1",
      "help.memberInviteContent2",
      "help.memberInviteContent3",
      "help.memberInviteContent4",
      "help.memberInviteContent5",
    ],
  },
  {
    key: "troubleshooting",
    slug: "troubleshooting",
    titleKey: "help.troubleshooting",
    descKey: "help.troubleshootingDesc",
    contentKeys: [
      "help.troubleshootingContent1",
      "help.troubleshootingContent2",
      "help.troubleshootingContent3",
      "help.troubleshootingContent4",
      "help.troubleshootingContent5",
    ],
  },
  {
    key: "tips",
    slug: "pro-tips",
    titleKey: "help.tips",
    descKey: "help.tipsDesc",
    contentKeys: [
      "help.tipsContent1",
      "help.tipsContent2",
      "help.tipsContent3",
      "help.tipsContent4",
      "help.tipsContent5",
    ],
    },
    {
    key: "marketplace",
    slug: "marketplace",
    titleKey: "help.marketplace",
    descKey: "help.marketplaceDesc",
    contentKeys: [
      "help.marketplaceContent1",
      "help.marketplaceContent2",
      "help.marketplaceContent3",
      "help.marketplaceContent4",
      "help.marketplaceContent5",
    ],
    },
    {
    key: "spam-appeal",
    slug: "spam-appeal",
    titleKey: "help.spamAppeal",
    descKey: "help.spamAppealDesc",
    contentKeys: [
      "help.spamAppealContent1",
      "help.spamAppealContent2",
      "help.spamAppealContent3",
      "help.spamAppealContent4",
    ],
    },
    {
    key: "auto-join",
    slug: "auto-join",
    titleKey: "help.autoJoin",
    descKey: "help.autoJoinDesc",
    contentKeys: [
      "help.autoJoinContent1",
      "help.autoJoinContent2",
      "help.autoJoinContent3",
      "help.autoJoinContent4",
      "help.autoJoinContent5",
    ],
  },
  {
    key: "smm-orders",
    slug: "smm-orders",
    titleKey: "help.smmOrders",
    descKey: "help.smmOrdersDesc",
    contentKeys: [
      "help.smmOrdersContent1",
      "help.smmOrdersContent2",
      "help.smmOrdersContent3",
      "help.smmOrdersContent4",
      "help.smmOrdersContent5",
    ],
  },
  {
    key: "billing",
    slug: "billing",
    titleKey: "help.billing",
    descKey: "help.billingDesc",
    contentKeys: [
      "help.billingContent1",
      "help.billingContent2",
      "help.billingContent3",
      "help.billingContent4",
      "help.billingContent5",
    ],
  },
  ];

export function getHelpSectionBySlug(slug: string): HelpSection | undefined {
  return helpSections.find((s) => s.slug === slug);
}

export function getAdjacentSections(
  key: string
): { prev: HelpSection | null; next: HelpSection | null } {
  const idx = helpSections.findIndex((s) => s.key === key);
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? helpSections[idx - 1] : null,
    next: idx < helpSections.length - 1 ? helpSections[idx + 1] : null,
  };
}
