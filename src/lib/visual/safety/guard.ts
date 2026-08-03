import type { VisualSafetyReport, VisualSafetyCheck, VisualGenerationRequest } from '../types';

const RESTRICTED_CONTENT = [
  /nudity|explicit|nsfw|porn|sexual/i,
  /violence|gore|blood|torture|murder/i,
  /hate.?speech|discriminat|racist|racism|sexist/i,
  /child.?abuse|minor|underage/i,
  /terrorism|extremist|bomb|weapon.?mass/i,
  /self.?harm|suicide|eating.?disorder/i,
  /illegal|drug.?production|weapon.?manufacturing/i,
  /misinformation|fake.?news|conspiracy/i,
];

const COPYRIGHTED_TERMS = [
  /mickey|disney|marvel|dc.?comics|harry.?potter/i,
  /star.?wars|star.?trek|lord.?of.?the.?rings/i,
  /nike|adidas|apple.?logo|coca.?cola|pepsi/i,
  /pokemon|pikachu|mario|zelda|nintendo/i,
  /fifa|olympics|nba|nfl|mlb|super.?bowl/i,
];

const TRADEMARKED_TERMS = [
  /photoshop|iphone|windows|android|java/i,
  /trademark|registered|tm|copyright|patent/i,
];

export class VisualSafetyGuard {
  analyzeRequest(request: VisualGenerationRequest): VisualSafetyReport {
    const prompt = request.prompt.toLowerCase();

    const copyrightCheck = this.checkCopyright(prompt);
    const trademarkCheck = this.checkTrademark(prompt);
    const deepfakeCheck = this.checkDeepfake(request);
    const misinformationCheck = this.checkMisinformation(prompt, request);
    const authenticityCheck = this.checkAuthenticity(request);
    const contentPolicyCheck = this.checkContentPolicy(prompt);

    const allPassed = copyrightCheck.passed && trademarkCheck.passed &&
      deepfakeCheck.passed && misinformationCheck.passed &&
      authenticityCheck.passed && contentPolicyCheck.passed;

    const scores = [copyrightCheck, trademarkCheck, deepfakeCheck,
      misinformationCheck, authenticityCheck, contentPolicyCheck];
    const overallScore = scores.reduce((sum, c) => sum + c.confidence, 0) / scores.length;

    return {
      passed: allPassed,
      checks: {
        copyright: copyrightCheck,
        trademark: trademarkCheck,
        deepfake: deepfakeCheck,
        misinformation: misinformationCheck,
        authenticity: authenticityCheck,
        contentPolicy: contentPolicyCheck,
      },
      overallScore,
    };
  }

  private checkCopyright(prompt: string): VisualSafetyCheck {
    const matches = COPYRIGHTED_TERMS.filter(r => r.test(prompt));
    return {
      passed: matches.length === 0,
      confidence: matches.length === 0 ? 0.95 : 0.3,
      issues: matches.length > 0 ? [`Potential copyrighted content detected: ${prompt.match(COPYRIGHTED_TERMS[0])?.[0] || 'unknown'}`] : [],
    };
  }

  private checkTrademark(prompt: string): VisualSafetyCheck {
    const matches = TRADEMARKED_TERMS.filter(r => r.test(prompt));
    return {
      passed: matches.length === 0,
      confidence: matches.length === 0 ? 0.9 : 0.4,
      issues: matches.length > 0 ? ['Trademarked terms detected — consider generic alternatives'] : [],
    };
  }

  private checkDeepfake(request: VisualGenerationRequest): VisualSafetyCheck {
    const hasReferenceImage = !!request.referenceImage;
    const isPersonGeneration = /person|man|woman|face|portrait|realistic photo/i.test(request.prompt);
    const concerns: string[] = [];
    if (hasReferenceImage && isPersonGeneration) {
      concerns.push('Reference image with person generation — verify consent');
    }
    return {
      passed: !(hasReferenceImage && isPersonGeneration),
      confidence: concerns.length === 0 ? 0.9 : 0.5,
      issues: concerns,
    };
  }

  private checkMisinformation(prompt: string, request?: VisualGenerationRequest): VisualSafetyCheck {
    const issues: string[] = [];
    if (/fake|hoax|conspiracy|false.?narrative|misleading/i.test(prompt)) {
      issues.push('Prompt contains misinformation-related terms');
    }
    if (request?.nonprofitMode && /exaggerat|misleading|fabricat/i.test(prompt)) {
      issues.push('Nonprofit mode prohibits exaggerated representations');
    }
    return {
      passed: issues.length === 0,
      confidence: issues.length === 0 ? 0.95 : 0.3,
      issues,
    };
  }

  private checkAuthenticity(request: VisualGenerationRequest): VisualSafetyCheck {
    const issues: string[] = [];
    if (/watermark|fake.?signature|counterfeit|forgery/i.test(request.prompt)) {
      issues.push('Request appears to involve deceptive content creation');
    }
    return {
      passed: issues.length === 0,
      confidence: issues.length === 0 ? 0.9 : 0.4,
      issues,
    };
  }

  private checkContentPolicy(prompt: string): VisualSafetyCheck {
    const matches = RESTRICTED_CONTENT.filter(r => r.test(prompt));
    return {
      passed: matches.length === 0,
      confidence: matches.length === 0 ? 0.95 : 0.1,
      issues: matches.length > 0 ? ['Content violates policy — restricted content detected'] : [],
    };
  }
}

export const visualSafetyGuard = new VisualSafetyGuard();
