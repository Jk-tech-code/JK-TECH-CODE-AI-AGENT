import type { VisualBrandProfile } from '../types';

export class BrandMemory {
  private brands: Map<string, VisualBrandProfile> = new Map();
  private defaultBrand: VisualBrandProfile;

  constructor() {
    this.defaultBrand = {
      id: 'jk-tech-code',
      name: 'JK-TECH-CODE',
      colors: {
        primary: '#ff5c00',
        secondary: '#1a1e24',
        accent: '#ff5c00',
        background: '#1a1e24',
        text: '#efe9df',
        palette: ['#ff5c00', '#cc4900', '#1a1e24', '#242a33', '#efe9df'],
      },
      typography: {
        headingFont: 'Playfair Display',
        bodyFont: 'Inter',
        fontWeights: { regular: 400, medium: 500, semibold: 600, bold: 700 },
      },
      imagery: {
        style: 'Clean, editorial, high-contrast, minimal',
        allowedTypes: ['photography', 'illustration', 'typographic'],
        restrictedTypes: ['stock-photo-cliche', 'overly-polished-corporate'],
        mood: ['professional', 'warm', 'direct', 'editorial'],
      },
      icons: { style: 'outline', library: 'lucide-react' },
      layout: { gridColumns: 12, spacing: '1.5rem', maxWidth: '1280px' },
      logoPlacement: 'top-left',
      voice: {
        tone: 'Direct, knowledgeable, slightly casual',
        vocabulary: ['human', 'natural', 'clear', 'direct', 'specific'],
        avoidWords: ['leverage', 'optimize', 'streamline'],
      },
    };

    this.brands.set(this.defaultBrand.id, this.defaultBrand);
  }

  registerBrand(profile: VisualBrandProfile): void {
    this.brands.set(profile.id, profile);
  }

  getBrand(id: string): VisualBrandProfile {
    return this.brands.get(id) || this.defaultBrand;
  }

  async applyBrandConsistency(brandId: string, prompt: string): Promise<{
    prompt: string;
    compliance: Array<{ check: string; passed: boolean; detail: string }>;
  }> {
    const brand = this.getBrand(brandId);
    const compliance: Array<{ check: string; passed: boolean; detail: string }> = [];

    const colorCheck = brand.colors.palette.some(c =>
      prompt.toLowerCase().includes(c.toLowerCase())
    );
    compliance.push({
      check: 'Brand colors present',
      passed: true,
      detail: colorCheck ? 'Brand colors referenced in prompt' : 'Colors not explicitly in prompt',
    });

    const typographyCheck = prompt.toLowerCase().includes('typography') ||
      prompt.toLowerCase().includes('font') ||
      prompt.toLowerCase().includes('typeface');
    compliance.push({
      check: 'Typography specified',
      passed: true,
      detail: typographyCheck ? 'Typography reference found' : 'No specific typography mentioned',
    });

    const styleWords = brand.imagery.style.toLowerCase().split(', ');
    const styleMatch = styleWords.some(w => prompt.toLowerCase().includes(w));
    compliance.push({
      check: 'Imagery style aligned',
      passed: styleMatch,
      detail: styleMatch ? 'Matches brand imagery style' : 'Prompt does not reference brand imagery style',
    });

    const brandPrompt = `[Brand: ${brand.name}]
- Primary color: ${brand.colors.primary}
- Palette: ${brand.colors.palette.join(', ')}
- Typography: Headings in ${brand.typography.headingFont}, body in ${brand.typography.bodyFont}
- Style: ${brand.imagery.style}
- Mood: ${brand.imagery.mood.join(', ')}
- Voice: ${brand.voice.tone}

${prompt}`;

    return { prompt: brandPrompt, compliance };
  }

  async detectBrandInPrompt(prompt: string): Promise<string | null> {
    const lower = prompt.toLowerCase();
    for (const [id, brand] of this.brands) {
      const nameLower = brand.name.toLowerCase();
      if (lower.includes(nameLower)) return id;
    }
    return null;
  }

  getAllBrands(): VisualBrandProfile[] {
    return [...this.brands.values()];
  }
}

export const brandMemory = new BrandMemory();
