import { describe, it, expect } from 'vitest';
import {
  WELL_KNOWN_KEYS,
  validateSpecsJson,
  buildExtractionPrompt,
} from './pdf-spec-extractor';

// ============================================================================
// WELL_KNOWN_KEYS
// ============================================================================

describe('WELL_KNOWN_KEYS', () => {
  it('has at least 40 keys', () => {
    expect(WELL_KNOWN_KEYS.length).toBeGreaterThanOrEqual(40);
  });

  it('all keys are snake_case (lowercase, underscores only)', () => {
    for (const key of WELL_KNOWN_KEYS) {
      expect(key).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('contains expected engine keys', () => {
    expect(WELL_KNOWN_KEYS).toContain('engine_type');
    expect(WELL_KNOWN_KEYS).toContain('power_kw');
    expect(WELL_KNOWN_KEYS).toContain('torque_nm');
    expect(WELL_KNOWN_KEYS).toContain('displacement_cc');
  });

  it('contains expected EV keys', () => {
    expect(WELL_KNOWN_KEYS).toContain('battery_kwh');
    expect(WELL_KNOWN_KEYS).toContain('range_km');
    expect(WELL_KNOWN_KEYS).toContain('charge_time_dc_minutes');
  });

  it('contains expected dimension keys', () => {
    expect(WELL_KNOWN_KEYS).toContain('length_mm');
    expect(WELL_KNOWN_KEYS).toContain('wheelbase_mm');
    expect(WELL_KNOWN_KEYS).toContain('kerb_weight_kg');
  });

  it('contains expected safety keys', () => {
    expect(WELL_KNOWN_KEYS).toContain('ancap_rating');
    expect(WELL_KNOWN_KEYS).toContain('aeb');
    expect(WELL_KNOWN_KEYS).toContain('blind_spot_monitor');
  });

  it('contains expected tech keys', () => {
    expect(WELL_KNOWN_KEYS).toContain('apple_carplay');
    expect(WELL_KNOWN_KEYS).toContain('android_auto');
    expect(WELL_KNOWN_KEYS).toContain('wireless_charging');
  });

  it('has no duplicate keys', () => {
    const set = new Set(WELL_KNOWN_KEYS);
    expect(set.size).toBe(WELL_KNOWN_KEYS.length);
  });
});

// ============================================================================
// validateSpecsJson
// ============================================================================

describe('validateSpecsJson', () => {
  function makeValidSpecs(specCount = 5) {
    return {
      categories: [
        {
          name: 'Engine',
          specs: Array.from({ length: specCount }, (_, i) => ({
            key: `power_kw_${i}`,
            label: `Power kW ${i}`,
            value: `${100 + i}`,
            unit: 'kW',
            raw: `${100 + i} kW`,
          })),
        },
      ],
    };
  }

  it('accepts a valid specs object', () => {
    const result = validateSpecsJson(makeValidSpecs(5));
    expect(result.valid).toBe(true);
    expect(result.specsCount).toBe(5);
    expect(result.categoriesCount).toBe(1);
    expect(result.error).toBeUndefined();
  });

  it('rejects null input', () => {
    const result = validateSpecsJson(null);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/object/i);
  });

  it('rejects non-object input (string)', () => {
    const result = validateSpecsJson('invalid');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects missing categories field', () => {
    const result = validateSpecsJson({ items: [] });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/categories/i);
  });

  it('rejects categories as non-array', () => {
    const result = validateSpecsJson({ categories: 'not-array' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/categories/i);
  });

  it('rejects empty categories array', () => {
    const result = validateSpecsJson({ categories: [] });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  it('rejects category with missing specs field', () => {
    const result = validateSpecsJson({
      categories: [{ name: 'Engine' }],
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/specs/i);
  });

  it('rejects spec missing key field', () => {
    const result = validateSpecsJson({
      categories: [
        {
          name: 'Engine',
          specs: [{ label: 'Power', value: '100', unit: 'kW', raw: '100 kW' }],
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/key/i);
  });

  it('rejects fewer than 3 specs with non-empty values', () => {
    const result = validateSpecsJson({
      categories: [
        {
          name: 'Engine',
          specs: [
            { key: 'power_kw', label: 'Power', value: '100', unit: 'kW', raw: '100 kW' },
            { key: 'torque_nm', label: 'Torque', value: '200', unit: 'Nm', raw: '200 Nm' },
          ],
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/3/);
  });

  it('does not count specs with empty value toward minimum', () => {
    // 2 non-empty + 2 empty = only 2 counted → invalid
    const result = validateSpecsJson({
      categories: [
        {
          name: 'Engine',
          specs: [
            { key: 'power_kw', label: 'Power', value: '100', unit: 'kW', raw: '100 kW' },
            { key: 'torque_nm', label: 'Torque', value: '200', unit: 'Nm', raw: '200 Nm' },
            { key: 'displacement_cc', label: 'Displacement', value: '', unit: null, raw: '' },
            { key: 'cylinders', label: 'Cylinders', value: '', unit: null, raw: '' },
          ],
        },
      ],
    });
    expect(result.valid).toBe(false);
  });

  it('accepts exactly 3 specs with non-empty values', () => {
    const result = validateSpecsJson({
      categories: [
        {
          name: 'Engine',
          specs: [
            { key: 'power_kw', label: 'Power', value: '100', unit: 'kW', raw: '100 kW' },
            { key: 'torque_nm', label: 'Torque', value: '200', unit: 'Nm', raw: '200 Nm' },
            { key: 'cylinders', label: 'Cylinders', value: '4', unit: null, raw: '4' },
          ],
        },
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.specsCount).toBe(3);
  });

  it('counts specs across multiple categories', () => {
    const result = validateSpecsJson({
      categories: [
        {
          name: 'Engine',
          specs: [
            { key: 'power_kw', label: 'Power', value: '100', unit: 'kW', raw: '100 kW' },
            { key: 'torque_nm', label: 'Torque', value: '200', unit: 'Nm', raw: '200 Nm' },
          ],
        },
        {
          name: 'Dimensions',
          specs: [
            { key: 'length_mm', label: 'Length', value: '4500', unit: 'mm', raw: '4500 mm' },
          ],
        },
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.specsCount).toBe(3);
    expect(result.categoriesCount).toBe(2);
  });
});

// ============================================================================
// buildExtractionPrompt
// ============================================================================

describe('buildExtractionPrompt', () => {
  const MODEL = 'Sportage';
  const OEM = 'Kia';
  const CHUNK = 'Engine: 2.0L 4-cylinder, 110 kW, 205 Nm\nLength: 4515 mm\nWidth: 1865 mm';

  it('includes model name in the prompt', () => {
    const prompt = buildExtractionPrompt(MODEL, OEM, CHUNK);
    expect(prompt).toContain(MODEL);
  });

  it('includes OEM name in the prompt', () => {
    const prompt = buildExtractionPrompt(MODEL, OEM, CHUNK);
    expect(prompt).toContain(OEM);
  });

  it('includes the chunk text in the prompt', () => {
    const prompt = buildExtractionPrompt(MODEL, OEM, CHUNK);
    expect(prompt).toContain('4-cylinder');
    expect(prompt).toContain('4515 mm');
  });

  it('references well-known keys in the prompt', () => {
    const prompt = buildExtractionPrompt(MODEL, OEM, CHUNK);
    // At least a few well-known keys should appear in the prompt
    expect(prompt).toMatch(/power_kw|torque_nm|length_mm/);
  });

  it('includes instructions for JSON output with categories structure', () => {
    const prompt = buildExtractionPrompt(MODEL, OEM, CHUNK);
    expect(prompt).toMatch(/categories/i);
    expect(prompt).toMatch(/json/i);
  });

  it('includes key/label/value/unit/raw field instructions', () => {
    const prompt = buildExtractionPrompt(MODEL, OEM, CHUNK);
    expect(prompt).toContain('key');
    expect(prompt).toContain('value');
    expect(prompt).toContain('unit');
  });

  it('truncates very long chunk text to 50000 chars', () => {
    const longChunk = 'x'.repeat(60000);
    const prompt = buildExtractionPrompt(MODEL, OEM, longChunk);
    // The chunk portion embedded in prompt should not exceed 50000 + overhead
    // We verify the total prompt length is bounded (not growing proportionally beyond 50000 chunk)
    expect(prompt.length).toBeLessThan(55000);
    // And the original 60000-char string is NOT fully present
    expect(prompt).not.toContain(longChunk);
  });

  it('does not truncate chunk text under 50000 chars', () => {
    const normalChunk = 'Engine displacement: 1998cc, Power: 110kW';
    const prompt = buildExtractionPrompt(MODEL, OEM, normalChunk);
    expect(prompt).toContain(normalChunk);
  });
});
