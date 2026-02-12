/**
 * Slack Notification Pipeline
 * 
 * Implements Section 8 (Notification Payload Templates) from spec.
 * Generates Slack blocks for various alert types.
 */

import type { ChangeAnalysis } from './change-detector';
import type { Product, Offer, OemId } from '../oem/types';
import { getOemDefinition } from '../oem/registry';

// ============================================================================
// Slack Block Types
// ============================================================================

export interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

export interface SlackMessage {
  blocks: SlackBlock[];
  text?: string; // Fallback text
}

// ============================================================================
// Price Change Alert (Section 8.1)
// ============================================================================

export function createPriceChangeAlert(
  oemId: OemId,
  product: Product,
  oldPrice: number | null,
  newPrice: number | null,
  adminUrl?: string
): SlackMessage {
  const oemDef = getOemDefinition(oemId);
  const change = oldPrice && newPrice ? newPrice - oldPrice : 0;
  const changeText = change > 0 ? `+$${change.toLocaleString()}` : `-$${Math.abs(change).toLocaleString()}`;
  const emoji = change > 0 ? '📈' : '📉';

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${emoji} Price Change — ${product.title}`,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*OEM:*\n${oemDef?.name || oemId}` },
        { type: 'mrkdwn', text: `*Model:*\n${product.title}` },
        { type: 'mrkdwn', text: `*Previous:*\n${oldPrice ? `$${oldPrice.toLocaleString()} ${product.price_type || ''}` : 'N/A'}` },
        { type: 'mrkdwn', text: `*New:*\n${newPrice ? `$${newPrice.toLocaleString()} ${product.price_type || ''}` : 'N/A'}` },
        { type: 'mrkdwn', text: `*Change:*\n${changeText}` },
        { type: 'mrkdwn', text: `*Detected:*\n${new Date().toLocaleString('en-AU')}` },
      ],
    },
  ];

  if (product.source_url || adminUrl) {
    const elements: Array<{ type: string; text?: { type: string; text: string }; url?: string; action_id?: string }> = [];
    
    if (product.source_url) {
      elements.push({
        type: 'button',
        text: { type: 'plain_text', text: 'View on OEM Site' },
        url: product.source_url,
        action_id: 'view_oem_site',
      });
    }
    
    if (adminUrl) {
      elements.push({
        type: 'button',
        text: { type: 'plain_text', text: 'View Diff' },
        url: adminUrl,
        action_id: 'view_diff',
      });
    }

    blocks.push({
      type: 'actions',
      elements,
    });
  }

  return {
    blocks,
    text: `Price Change: ${product.title} - ${changeText}`,
  };
}

// ============================================================================
// New Offer Alert (Section 8.2)
// ============================================================================

export function createNewOfferAlert(
  oemId: OemId,
  offer: Offer
): SlackMessage {
  const oemDef = getOemDefinition(oemId);

  const fields = [
    `*OEM:*\n${oemDef?.name || oemId}`,
    `*Offer:*\n${offer.title}`,
  ];

  if (offer.offer_type) {
    fields.push(`*Type:*\n${offer.offer_type}`);
  }

  if (offer.validity_raw_string || (offer.start_date && offer.end_date)) {
    const validity = offer.validity_raw_string || 
      `${offer.start_date} to ${offer.end_date}`;
    fields.push(`*Validity:*\n${validity}`);
  }

  if (offer.eligibility) {
    fields.push(`*Eligibility:*\n${offer.eligibility}`);
  }

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🆕 New Offer — ${oemDef?.name || oemId}`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${offer.title}*\n${offer.description || ''}`,
      },
    },
    {
      type: 'section',
      fields: fields.map(text => ({ type: 'mrkdwn', text })),
    },
  ];

  if (offer.cta_url) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View Offer' },
          url: offer.cta_url,
          action_id: 'view_offer',
        },
      ],
    });
  }

  return {
    blocks,
    text: `New Offer: ${offer.title} — ${oemDef?.name || oemId}`,
  };
}

// ============================================================================
// New Product Alert
// ============================================================================

export function createNewProductAlert(
  oemId: OemId,
  product: Product
): SlackMessage {
  const oemDef = getOemDefinition(oemId);

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🚗 New Product Discovered — ${product.title}`,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*OEM:*\n${oemDef?.name || oemId}` },
        { type: 'mrkdwn', text: `*Model:*\n${product.title}` },
        { type: 'mrkdwn', text: `*Body Type:*\n${product.body_type || 'N/A'}` },
        { type: 'mrkdwn', text: `*Fuel Type:*\n${product.fuel_type || 'N/A'}` },
        { type: 'mrkdwn', text: `*Price:*\n${product.price_amount ? `$${product.price_amount.toLocaleString()}` : 'N/A'}` },
        { type: 'mrkdwn', text: `*Availability:*\n${product.availability}` },
      ],
    },
  ];

  if (product.key_features?.length) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Key Features:*\n${product.key_features.join(', ')}`,
      },
    });
  }

  if (product.source_url) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View on OEM Site' },
          url: product.source_url,
          action_id: 'view_product',
        },
      ],
    });
  }

  return {
    blocks,
    text: `New Product: ${product.title} — ${oemDef?.name || oemId}`,
  };
}

// ============================================================================
// Availability Change Alert
// ============================================================================

export function createAvailabilityChangeAlert(
  oemId: OemId,
  product: Product,
  oldAvailability: string,
  newAvailability: string
): SlackMessage {
  const oemDef = getOemDefinition(oemId);
  const isPositive = newAvailability === 'available' && oldAvailability !== 'available';
  const emoji = isPositive ? '✅' : '⚠️';

  return {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} Availability Change — ${product.title}`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*OEM:*\n${oemDef?.name || oemId}` },
          { type: 'mrkdwn', text: `*Model:*\n${product.title}` },
          { type: 'mrkdwn', text: `*Previous:*\n${oldAvailability}` },
          { type: 'mrkdwn', text: `*New:*\n${newAvailability}` },
        ],
      },
    ],
    text: `Availability Change: ${product.title} — ${oldAvailability} → ${newAvailability}`,
  };
}

// ============================================================================
// Banner Change Alert (Batch)
// ============================================================================

export function createBannerChangeAlert(
  oemId: OemId,
  changes: Array<{ position: number; headline: string | null; changeType: string }>
): SlackMessage {
  const oemDef = getOemDefinition(oemId);

  const changeList = changes.map(c => 
    `• Slide ${c.position}${c.headline ? `: "${c.headline}"` : ''} — ${c.changeType}`
  ).join('\n');

  return {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `🎨 Homepage Banner Changes — ${oemDef?.name || oemId}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${changes.length} banner slide(s) changed:*\n${changeList}`,
        },
      },
    ],
    text: `Banner Changes: ${changes.length} slide(s) updated on ${oemDef?.name || oemId}`,
  };
}

// ============================================================================
// Daily Digest
// ============================================================================

export interface DailyDigestData {
  date: string;
  oemSummaries: Array<{
    oemId: OemId;
    changeCount: number;
    newProducts: number;
    newOffers: number;
    priceChanges: number;
    topChanges: ChangeAnalysis[];
  }>;
}

export function createDailyDigest(data: DailyDigestData): SlackMessage {
  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `📊 Daily Change Summary — ${data.date}`,
      },
    },
  ];

  let totalChanges = 0;
  let totalNewProducts = 0;
  let totalNewOffers = 0;

  data.oemSummaries.forEach(summary => {
    totalChanges += summary.changeCount;
    totalNewProducts += summary.newProducts;
    totalNewOffers += summary.newOffers;

    const oemDef = getOemDefinition(summary.oemId);
    
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${oemDef?.name || summary.oemId}*\n` +
              `${summary.changeCount} changes | ` +
              `${summary.newProducts} new products | ` +
              `${summary.newOffers} new offers`,
      },
    });

    // Top 3 changes per OEM
    if (summary.topChanges.length > 0) {
      const topChangesText = summary.topChanges
        .slice(0, 3)
        .map(c => `• ${c.summary}`)
        .join('\n');
      
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Top changes:\n${topChangesText}`,
          },
        ],
      });
    }

    blocks.push({ type: 'divider' });
  });

  // Summary footer
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Total across all OEMs:* ${totalChanges} changes, ${totalNewProducts} new products, ${totalNewOffers} new offers`,
    },
  });

  return {
    blocks,
    text: `Daily Digest: ${totalChanges} changes across ${data.oemSummaries.length} OEMs`,
  };
}

// ============================================================================
// Slack Webhook Sender
// ============================================================================

export class SlackNotifier {
  private webhookUrl: string;
  private channel?: string;

  constructor(webhookUrl: string, channel?: string) {
    this.webhookUrl = webhookUrl;
    this.channel = channel;
  }

  async send(message: SlackMessage): Promise<{ success: boolean; error?: string }> {
    try {
      const payload: Record<string, unknown> = {
        blocks: message.blocks,
        text: message.text,
      };

      if (this.channel) {
        payload.channel = this.channel;
      }

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Slack API error: ${response.status} - ${error}` };
      }

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  async sendPriceChange(
    oemId: OemId,
    product: Product,
    oldPrice: number | null,
    newPrice: number | null,
    adminUrl?: string
  ): Promise<{ success: boolean; error?: string }> {
    const message = createPriceChangeAlert(oemId, product, oldPrice, newPrice, adminUrl);
    return this.send(message);
  }

  async sendNewOffer(
    oemId: OemId,
    offer: Offer
  ): Promise<{ success: boolean; error?: string }> {
    const message = createNewOfferAlert(oemId, offer);
    return this.send(message);
  }

  async sendNewProduct(
    oemId: OemId,
    product: Product
  ): Promise<{ success: boolean; error?: string }> {
    const message = createNewProductAlert(oemId, product);
    return this.send(message);
  }

  async sendAvailabilityChange(
    oemId: OemId,
    product: Product,
    oldAvailability: string,
    newAvailability: string
  ): Promise<{ success: boolean; error?: string }> {
    const message = createAvailabilityChangeAlert(oemId, product, oldAvailability, newAvailability);
    return this.send(message);
  }

  async sendDailyDigest(data: DailyDigestData): Promise<{ success: boolean; error?: string }> {
    const message = createDailyDigest(data);
    return this.send(message);
  }
}

// ============================================================================
// Multi-Channel Notifier
// ============================================================================

export interface NotificationConfig {
  slackWebhookUrl: string;
  slackChannel?: string;
  emailSmtpConfig?: {
    host: string;
    port: number;
    user: string;
    pass: string;
  };
  emailRecipients?: string[];
}

export class MultiChannelNotifier {
  private slack: SlackNotifier;
  private config: NotificationConfig;

  constructor(config: NotificationConfig) {
    this.config = config;
    this.slack = new SlackNotifier(config.slackWebhookUrl, config.slackChannel);
  }

  async notify(analysis: ChangeAnalysis, oemId: OemId): Promise<void> {
    // Immediate alerts go to Slack
    if (analysis.alertChannel === 'slack_immediate') {
      await this.sendSlackAlert(analysis, oemId);
    }

    // Critical alerts also trigger email
    if (analysis.severity === 'critical' && this.config.emailRecipients?.length) {
      await this.sendEmailAlert(analysis, oemId);
    }
  }

  private async sendSlackAlert(analysis: ChangeAnalysis, oemId: OemId): Promise<void> {
    // This would create appropriate Slack message based on analysis
    // For now, just log
    console.log(`[Slack Alert] ${oemId}: ${analysis.summary}`);
  }

  private async sendEmailAlert(analysis: ChangeAnalysis, oemId: OemId): Promise<void> {
    // Email sending would be implemented here
    console.log(`[Email Alert] ${oemId}: ${analysis.summary}`);
  }

  async sendDailyDigest(data: DailyDigestData): Promise<void> {
    await this.slack.sendDailyDigest(data);
  }
}
