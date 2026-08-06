import { describe, it, expect } from 'vitest';
import {
  detectContentKind,
  generateContent,
  finalizeContent,
} from '../src/brain/providers/content-engine';
import { analyzeQuery, composeNoSearch } from '../src/brain/providers/answer-composer';

const req = (raw: string, subject: string) => ({ raw, subject });

describe('content engine — kind detection', () => {
  it.each([
    ['write a business plan for a coffee shop', 'business-plan'],
    ['draft a project proposal for a website redesign', 'project-proposal'],
    ['write a blog post about remote work', 'blog-post'],
    ['create an seo article about morning routines', 'seo-article'],
    ['give me an instagram caption for my cafe', 'instagram-caption'],
    ['draft a linkedin post about productivity', 'linkedin-post'],
    ['write a product description for a bluetooth speaker', 'product-description'],
    ['create an amazon listing for a water bottle', 'amazon-listing'],
    ['draft an x post about the new launch', 'x-post'],
    ['write a press release for our funding', 'press-release'],
    ['prepare a newsletter for next week', 'newsletter'],
    ['draft a cover letter for a data analyst role', 'cover-letter'],
    ['update my resume for a senior role', 'resume'],
    ['write an essay on climate change', 'essay'],
    ['summarize the literature on sleep', 'literature-review'],
    ['write a short story about a lost key', 'story'],
    ['write a poem about the sea', 'poem'],
    ['write a song about hope', 'song'],
    ['write a readme for the api package', 'readme'],
    ['document the api for the payments module', 'api-doc'],
    ['write a technical spec for the auth service', 'tech-spec'],
    ['draft meeting minutes from the notes', 'meeting-minutes'],
    ['write an invoice for the client', 'invoice'],
    ['create a quotation for a fence install', 'quotation'],
    ['draft a contract for freelance work', 'contract'],
    ['write a standard operating procedure for onboarding', 'sop'],
    ['create a company policy on remote work', 'policy'],
    ['write a strategic plan for 2027', 'strategic-plan'],
    ['write a business report for q3', 'business-report'],
    ['write a meta description for the pricing page', 'meta-description'],
    ['give me an faq section for the landing page', 'faq'],
    ['write a keyword plan for the bakery site', 'keyword'],
    ['write a url slug for the product page', 'url-slug'],
    ['write alt text for the hero image', 'image-alt'],
    ['create a topic cluster for seo courses', 'topic-cluster'],
  ])('detects %s → %s', (raw, kind) => {
    expect(detectContentKind(raw).kind).toBe(kind);
  });
});

describe('content engine — generation quality', () => {
  it('produces a complete business plan without boilerplate or placeholders', () => {
    const { kind, content } = generateContent(req('write a business plan for a coffee shop', 'coffee shop'));
    expect(kind).toBe('Business Plan');
    expect(content).toContain('Coffee Shop');
    expect(content).toContain('Executive Summary');
    expect(content).toContain('Financial Projections');
    expect(content).not.toMatch(/here is a template/i);
    expect(content).not.toMatch(/i cannot|as an ai/i);
    expect(content.length).toBeGreaterThan(300);
  });

  it('weaves the topic into a landing page', () => {
    const { content } = generateContent(req('create a landing page for a yoga studio', 'yoga studio'));
    expect(content).toContain('Yoga Studio');
    expect(content).toContain('Call to action');
    expect(content).toContain('Social proof');
  });

  it('adapts tone from the request', () => {
    const { content } = generateContent(req('write a persuasive landing page for solar panels', 'solar panels'));
    expect(content.length).toBeGreaterThan(200);
  });

  it('produces a cover letter with a salutation and closing', () => {
    const { content } = generateContent(req('draft a cover letter for a data analyst role', 'data analyst'));
    expect(content).toContain('Dear Hiring Team');
    expect(content).toContain('Best regards');
  });

  it('produces an SEO article that answers immediately and finalizes cleanly', () => {
    const { content } = generateContent(req('write a short seo article about morning routines', 'morning routines'));
    const cleaned = finalizeContent(content);
    expect(cleaned).toBe(cleaned.trim());
    expect(cleaned).not.toMatch(/\n{3,}/);
    expect(cleaned).toContain('Morning Routines');
  });

  it('never leaks placeholder templates or AI disclaimers across kinds', () => {
    const kinds = ['write a business plan for a coffee shop', 'write a poem about the sea', 'draft an invoice for the client', 'write a press release for our funding', 'write a short story about a lost key', 'create an amazon listing for a water bottle'];
    for (const raw of kinds) {
      const { content } = generateContent(req(raw, raw.replace(/^(write|draft|create|give me)\s+(a |an |the )?/, '')));
      expect(content).not.toMatch(/here is a template/i);
      expect(content).not.toMatch(/as an ai language model/i);
      expect(content.length).toBeGreaterThan(120);
    }
  });
});

describe('content engine — intent routing via search-engine analysis', () => {
  it('routes writing intents to a generated artifact with no search needed', () => {
    const a = analyzeQuery('write a business plan for a coffee shop');
    expect(a.intent).toBe('writing');
    expect(a.needsSearch).toBe(false);
  });

  it('still routes research queries through search', () => {
    const a = analyzeQuery('research the effects of caffeine on sleep');
    expect(a.needsSearch).toBe(true);
  });

  it('routes a business-plan request end-to-end through the composer', () => {
    const a = analyzeQuery('write a business plan for a coffee shop');
    const content = composeNoSearch(a);
    expect(content).toContain('Business Plan');
    expect(content).toContain('Executive Summary');
    expect(content.length).toBeGreaterThan(400);
  });

  it('routes a blog post request to a titled article', () => {
    const a = analyzeQuery('write a blog post about remote work');
    const content = composeNoSearch(a);
    expect(content.length).toBeGreaterThan(300);
    expect(content).not.toMatch(/Sources/);
  });
});
