import type { VisualSeoMetadata, GeneratedImage } from '../types';

export class VisualSeoOptimizer {
  generate(request: { prompt: string; image: GeneratedImage }): VisualSeoMetadata {
    const promptWords = request.prompt
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2);

    const filename = this.generateFilename(request.prompt, request.image.format);
    const altText = this.generateAltText(request.prompt);
    const title = this.generateTitle(request.prompt);
    const description = this.generateDescription(request.prompt);
    const keywords = this.extractKeywords(promptWords);

    return {
      filename,
      altText,
      title,
      caption: description,
      description: description.slice(0, 160),
      ogTags: {
        image: request.image.url,
        imageAlt: altText,
        imageWidth: request.image.width,
        imageHeight: request.image.height,
        imageType: `image/${request.image.format}`,
      },
      twitterCard: {
        card: 'summary_large_image',
        image: request.image.url,
        imageAlt: altText,
      },
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'ImageObject',
        contentUrl: request.image.url,
        description: description.slice(0, 200),
        name: title,
        keywords: keywords.join(', '),
      },
      keywords,
    };
  }

  private generateFilename(prompt: string, format: string): string {
    const slug = prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    const date = new Date().toISOString().split('T')[0];
    return `${slug}-${date}.${format}`;
  }

  private generateAltText(prompt: string): string {
    let alt = prompt
      .replace(/^(a |an |the )/i, '')
      .replace(/create|generate|make|design|produce/i, '')
      .trim();
    if (alt.length > 120) alt = alt.slice(0, 117) + '...';
    return alt || 'Generated image from JK-TECH-CODE AI';
  }

  private generateTitle(prompt: string): string {
    const title = prompt
      .split(/[,.:;!?]/)[0]
      .replace(/^(create|generate|make|design|produce)\s+/i, '')
      .trim();
    return title.length > 60 ? title.slice(0, 57) + '...' : title || 'Generated Visual';
  }

  private generateDescription(prompt: string): string {
    return prompt.length > 160 ? prompt.slice(0, 157) + '...' : prompt;
  }

  private extractKeywords(words: string[]): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
      'this', 'that', 'these', 'those', 'it', 'its', 'very', 'just',
    ]);

    const wordFreq = new Map<string, number>();
    for (const word of words) {
      if (!stopWords.has(word)) {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      }
    }

    return [...wordFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }
}

export const visualSeo = new VisualSeoOptimizer();
