/**
 * Change Detection & Alert Rules
 * 
 * Implements Section 4 (Change Detection & Alert Rules) from spec.
 * Determines if changes are meaningful vs noise, and routes alerts appropriately.
 */

import type { 
  Product, 
  Offer, 
  Banner, 
  ChangeEvent,
  EntityType,
  EventType,
  Severity,
  OemId,
} from '../oem/types';

// ============================================================================
// Alert Rules (from spec Section 4.1)
// ============================================================================

export interface AlertRule {
  entityType: EntityType;
  field: string;
  severity: Severity;
  alertChannel: 'slack_immediate' | 'slack_batch_hourly' | 'slack_batch_daily' | 'email';
}

export const ALERT_RULES: AlertRule[] = [
  // Product rules
  { entityType: 'product', field: 'title', severity: 'high', alertChannel: 'slack_immediate' },
  { entityType: 'product', field: 'price_amount', severity: 'high', alertChannel: 'slack_immediate' },
  { entityType: 'product', field: 'price_type', severity: 'medium', alertChannel: 'slack_immediate' },
  { entityType: 'product', field: 'availability', severity: 'high', alertChannel: 'slack_immediate' },
  { entityType: 'product', field: 'disclaimer_text', severity: 'medium', alertChannel: 'slack_immediate' },
  { entityType: 'product', field: 'primary_image_r2_key', severity: 'medium', alertChannel: 'slack_batch_hourly' },
  { entityType: 'product', field: 'variants', severity: 'high', alertChannel: 'slack_immediate' },
  { entityType: 'product', field: 'variants_price_amount', severity: 'high', alertChannel: 'slack_immediate' },
  { entityType: 'product', field: 'created', severity: 'critical', alertChannel: 'slack_immediate' }, // New product
  { entityType: 'product', field: 'removed', severity: 'critical', alertChannel: 'slack_immediate' },

  // Offer rules
  { entityType: 'offer', field: 'created', severity: 'high', alertChannel: 'slack_immediate' },
  { entityType: 'offer', field: 'removed', severity: 'high', alertChannel: 'slack_immediate' },
  { entityType: 'offer', field: 'price_amount', severity: 'high', alertChannel: 'slack_immediate' },
  { entityType: 'offer', field: 'disclaimer_text', severity: 'medium', alertChannel: 'slack_immediate' },
  { entityType: 'offer', field: 'end_date', severity: 'medium', alertChannel: 'slack_immediate' },
  { entityType: 'offer', field: 'applicable_models', severity: 'medium', alertChannel: 'slack_immediate' },

  // Banner rules
  { entityType: 'banner', field: 'created', severity: 'medium', alertChannel: 'slack_batch_hourly' },
  { entityType: 'banner', field: 'removed', severity: 'low', alertChannel: 'slack_batch_daily' },
  { entityType: 'banner', field: 'image_sha256', severity: 'medium', alertChannel: 'slack_batch_hourly' },
  { entityType: 'banner', field: 'headline', severity: 'medium', alertChannel: 'slack_batch_hourly' },
  { entityType: 'banner', field: 'cta_text', severity: 'medium', alertChannel: 'slack_batch_hourly' },

  // Sitemap rules
  { entityType: 'sitemap', field: 'new_url', severity: 'medium', alertChannel: 'slack_immediate' },
  { entityType: 'sitemap', field: 'removed_url', severity: 'low', alertChannel: 'slack_batch_daily' },
];

// ============================================================================
// Fields to Ignore (from spec Section 4.2)
// ============================================================================

export const NOISE_FIELDS = [
  // Tracking parameters
  /^utm_/,
  /^gclid$/,
  /^fbclid$/,
  /^session/i,
  /^_ga$/,
  /^_gid$/,
  
  // Dynamic timestamps
  /copyright.*year/i,
  /last.*updated/i,
  /page.*generated/i,
  
  // A/B testing
  /^experiment/i,
  /^variant/i,
  
  // Analytics
  /analytics/i,
  /tracking/i,
  
  // CSS/build hashes
  /^class$/,
  /css-hash/i,
  
  // Social counts
  /comment.*count/i,
  /share.*count/i,
  
  // Cookie consent
  /cookie/i,
  /consent/i,
];

export function isNoiseField(fieldName: string): boolean {
  return NOISE_FIELDS.some((pattern: RegExp | string) => {
    if (pattern instanceof RegExp) {
      return pattern.test(fieldName);
    }
    return fieldName.toLowerCase().includes((pattern as string).toLowerCase());
  });
}

// ============================================================================
// Change Detection Engine
// ============================================================================

export interface FieldChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  isMeaningful: boolean;
}

export interface ChangeAnalysis {
  entityType: EntityType;
  entityId: string;
  eventType: EventType;
  severity: Severity;
  summary: string;
  fieldChanges: FieldChange[];
  meaningfulChanges: FieldChange[];
  alertChannel: string;
}

export class ChangeDetector {
  /**
   * Detect changes between old and new product.
   */
  detectProductChanges(oldProduct: Product | null, newProduct: Product): ChangeAnalysis | null {
    if (!oldProduct) {
      return {
        entityType: 'product',
        entityId: newProduct.id,
        eventType: 'created',
        severity: 'critical',
        summary: `New product discovered: ${newProduct.title}`,
        fieldChanges: [],
        meaningfulChanges: [],
        alertChannel: 'slack_immediate',
      };
    }

    const changes: FieldChange[] = [];

    // Compare key fields
    const fieldsToCompare: Array<keyof Product> = [
      'title', 'subtitle', 'body_type', 'fuel_type', 'availability',
      'price_amount', 'price_type', 'price_raw_string', 'disclaimer_text',
      'primary_image_r2_key', 'key_features', 'variants', 'cta_links'
    ];

    for (const field of fieldsToCompare) {
      const oldValue = oldProduct[field];
      const newValue = newProduct[field];

      if (!this.valuesEqual(oldValue, newValue)) {
        changes.push({
          field: String(field),
          oldValue,
          newValue,
          isMeaningful: this.isMeaningfulChange('product', String(field), oldValue, newValue),
        });
      }
    }

    if (changes.length === 0) {
      return null; // No changes detected
    }

    const meaningfulChanges = changes.filter(c => c.isMeaningful);
    const severity = this.determineSeverity('product', meaningfulChanges);
    const eventType = this.determineEventType('product', meaningfulChanges);

    return {
      entityType: 'product',
      entityId: newProduct.id,
      eventType,
      severity,
      summary: this.generateSummary('product', newProduct.title, meaningfulChanges),
      fieldChanges: changes,
      meaningfulChanges,
      alertChannel: this.determineAlertChannel('product', meaningfulChanges),
    };
  }

  /**
   * Detect changes between old and new offer.
   */
  detectOfferChanges(oldOffer: Offer | null, newOffer: Offer): ChangeAnalysis | null {
    if (!oldOffer) {
      return {
        entityType: 'offer',
        entityId: newOffer.id,
        eventType: 'created',
        severity: 'high',
        summary: `New offer discovered: ${newOffer.title}`,
        fieldChanges: [],
        meaningfulChanges: [],
        alertChannel: 'slack_immediate',
      };
    }

    const changes: FieldChange[] = [];

    const fieldsToCompare: Array<keyof Offer> = [
      'title', 'description', 'offer_type', 'applicable_models',
      'price_amount', 'price_type', 'saving_amount',
      'start_date', 'end_date', 'disclaimer_text', 'eligibility'
    ];

    for (const field of fieldsToCompare) {
      const oldValue = oldOffer[field];
      const newValue = newOffer[field];

      if (!this.valuesEqual(oldValue, newValue)) {
        changes.push({
          field: String(field),
          oldValue,
          newValue,
          isMeaningful: this.isMeaningfulChange('offer', String(field), oldValue, newValue),
        });
      }
    }

    if (changes.length === 0) {
      return null;
    }

    const meaningfulChanges = changes.filter(c => c.isMeaningful);
    const severity = this.determineSeverity('offer', meaningfulChanges);
    const eventType = this.determineEventType('offer', meaningfulChanges);

    return {
      entityType: 'offer',
      entityId: newOffer.id,
      eventType,
      severity,
      summary: this.generateSummary('offer', newOffer.title, meaningfulChanges),
      fieldChanges: changes,
      meaningfulChanges,
      alertChannel: this.determineAlertChannel('offer', meaningfulChanges),
    };
  }

  /**
   * Detect changes between old and new banner.
   */
  detectBannerChanges(oldBanner: Banner | null, newBanner: Banner): ChangeAnalysis | null {
    if (!oldBanner) {
      return {
        entityType: 'banner',
        entityId: newBanner.id,
        eventType: 'created',
        severity: 'medium',
        summary: `New banner slide added (position ${newBanner.position})`,
        fieldChanges: [],
        meaningfulChanges: [],
        alertChannel: 'slack_batch_hourly',
      };
    }

    const changes: FieldChange[] = [];

    const fieldsToCompare: Array<keyof Banner> = [
      'headline', 'sub_headline', 'cta_text', 'cta_url',
      'image_sha256', 'disclaimer_text'
    ];

    for (const field of fieldsToCompare) {
      const oldValue = oldBanner[field];
      const newValue = newBanner[field];

      if (!this.valuesEqual(oldValue, newValue)) {
        changes.push({
          field: String(field),
          oldValue,
          newValue,
          isMeaningful: this.isMeaningfulChange('banner', String(field), oldValue, newValue),
        });
      }
    }

    if (changes.length === 0) {
      return null;
    }

    const meaningfulChanges = changes.filter(c => c.isMeaningful);
    const severity = this.determineSeverity('banner', meaningfulChanges);
    const eventType = this.determineEventType('banner', meaningfulChanges);

    return {
      entityType: 'banner',
      entityId: newBanner.id,
      eventType,
      severity,
      summary: this.generateSummary('banner', `Banner ${newBanner.position}`, meaningfulChanges),
      fieldChanges: changes,
      meaningfulChanges,
      alertChannel: this.determineAlertChannel('banner', meaningfulChanges),
    };
  }

  /**
   * Check if two values are equal (deep comparison for objects/arrays).
   */
  private valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    
    if (typeof a !== typeof b) return false;
    
    if (typeof a === 'object') {
      // Handle arrays
      if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return a.every((item, i) => this.valuesEqual(item, b[i]));
      }
      
      // Handle objects
      const aObj = a as Record<string, unknown>;
      const bObj = b as Record<string, unknown>;
      const aKeys = Object.keys(aObj);
      const bKeys = Object.keys(bObj);
      
      if (aKeys.length !== bKeys.length) return false;
      
      return aKeys.every(key => this.valuesEqual(aObj[key], bObj[key]));
    }
    
    return false;
  }

  /**
   * Determine if a change is meaningful vs noise.
   */
  private isMeaningfulChange(
    entityType: EntityType,
    field: string,
    oldValue: unknown,
    newValue: unknown
  ): boolean {
    // Skip noise fields
    if (isNoiseField(field)) {
      return false;
    }

    // Price changes are always meaningful
    if (field.includes('price')) {
      return true;
    }

    // Availability changes are always meaningful
    if (field === 'availability') {
      return true;
    }

    // Image changes where hash is same (CDN URL rotation) is noise
    if (field.includes('image') && field.includes('r2_key')) {
      // Only meaningful if the actual image content changed
      return true; // Will be checked by image hash comparison
    }

    // Empty to non-empty is meaningful
    if (!oldValue && newValue) {
      return true;
    }

    // Non-empty to empty might be meaningful (field removed)
    if (oldValue && !newValue) {
      return true;
    }

    return true; // Default to meaningful
  }

  /**
   * Determine severity based on changed fields.
   */
  private determineSeverity(entityType: EntityType, meaningfulChanges: FieldChange[]): Severity {
    if (meaningfulChanges.length === 0) {
      return 'low';
    }

    // Check for critical fields
    const criticalFields = ['title', 'price_amount', 'availability', 'created', 'removed'];
    if (meaningfulChanges.some(c => criticalFields.includes(c.field))) {
      return 'critical';
    }

    // Check for high severity fields
    const highFields = ['variants', 'offer_type', 'saving_amount', 'end_date'];
    if (meaningfulChanges.some(c => highFields.includes(c.field))) {
      return 'high';
    }

    return 'medium';
  }

  /**
   * Determine event type based on changes.
   */
  private determineEventType(entityType: EntityType, meaningfulChanges: FieldChange[]): EventType {
    if (meaningfulChanges.some(c => c.field === 'price_amount')) {
      return 'price_changed';
    }
    if (meaningfulChanges.some(c => c.field === 'disclaimer_text')) {
      return 'disclaimer_changed';
    }
    if (meaningfulChanges.some(c => c.field === 'availability')) {
      return 'availability_changed';
    }
    if (meaningfulChanges.some(c => c.field === 'primary_image_r2_key' || c.field === 'image_sha256')) {
      return 'image_changed';
    }
    return 'updated';
  }

  /**
   * Generate human-readable summary of changes.
   */
  private generateSummary(entityType: EntityType, entityName: string, meaningfulChanges: FieldChange[]): string {
    if (meaningfulChanges.length === 0) {
      return `${entityType} ${entityName}: Minor changes detected`;
    }

    const changeDescriptions = meaningfulChanges.map(c => {
      if (c.field.includes('price')) {
        const oldPrice = c.oldValue ? `$${c.oldValue}` : 'N/A';
        const newPrice = c.newValue ? `$${c.newValue}` : 'N/A';
        return `price changed from ${oldPrice} to ${newPrice}`;
      }
      if (c.field === 'availability') {
        return `availability changed from ${c.oldValue} to ${c.newValue}`;
      }
      return `${c.field} changed`;
    });

    return `${entityType} ${entityName}: ${changeDescriptions.join(', ')}`;
  }

  /**
   * Determine alert channel based on entity type and changes.
   */
  private determineAlertChannel(entityType: EntityType, meaningfulChanges: FieldChange[]): string {
    const rules = ALERT_RULES.filter(r => r.entityType === entityType);
    
    // Find matching rule
    for (const change of meaningfulChanges) {
      const rule = rules.find(r => r.field === change.field);
      if (rule) {
        return rule.alertChannel;
      }
    }

    // Default channels
    if (entityType === 'product') return 'slack_immediate';
    if (entityType === 'offer') return 'slack_immediate';
    if (entityType === 'banner') return 'slack_batch_hourly';
    return 'slack_batch_daily';
  }
}

// ============================================================================
// Batch Alert Queue
// ============================================================================

export interface BatchedAlert {
  id: string;
  oemId: OemId;
  channel: 'slack_batch_hourly' | 'slack_batch_daily';
  analyses: ChangeAnalysis[];
  createdAt: Date;
}

export class AlertBatcher {
  private hourlyQueue: Map<string, ChangeAnalysis[]> = new Map();
  private dailyQueue: Map<string, ChangeAnalysis[]> = new Map();

  add(analysis: ChangeAnalysis, oemId: OemId): void {
    if (analysis.alertChannel === 'slack_batch_hourly') {
      const existing = this.hourlyQueue.get(oemId) || [];
      existing.push(analysis);
      this.hourlyQueue.set(oemId, existing);
    } else if (analysis.alertChannel === 'slack_batch_daily') {
      const existing = this.dailyQueue.get(oemId) || [];
      existing.push(analysis);
      this.dailyQueue.set(oemId, existing);
    }
  }

  getHourlyBatch(oemId: OemId): ChangeAnalysis[] {
    return this.hourlyQueue.get(oemId) || [];
  }

  getDailyBatch(oemId: OemId): ChangeAnalysis[] {
    return this.dailyQueue.get(oemId) || [];
  }

  clearHourly(oemId: OemId): void {
    this.hourlyQueue.delete(oemId);
  }

  clearDaily(oemId: OemId): void {
    this.dailyQueue.delete(oemId);
  }

  getAllOemIds(): OemId[] {
    const hourly = Array.from(this.hourlyQueue.keys());
    const daily = Array.from(this.dailyQueue.keys());
    return Array.from(new Set([...hourly, ...daily])) as OemId[];
  }
}
