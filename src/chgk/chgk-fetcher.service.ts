import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

const CHGK_URL =
  'http://questions.chgk.info/cgi-bin/db.cgi?qnum=1&type=chgk&email=&Get=Get+random+questions&rand=yes';

export interface ParsedChGKQuestion {
  question: string;
  answer: string;
}

@Injectable()
export class ChGKFetcherService {
  private readonly logger = new Logger(ChGKFetcherService.name);

  async fetchQuestion(): Promise<ParsedChGKQuestion | null> {
    try {
      const response = await fetch(CHGK_URL);
      const buffer = await response.buffer();
      const html = new TextDecoder('koi8-r').decode(buffer);
      return this.parseQuestion(html);
    } catch (err) {
      this.logger.error(`Failed to fetch ChGK question: ${(err as Error).message}`);
      return null;
    }
  }

  private extractText(html: string): string {
    const $ = cheerio.load(html);
    $('style, script').remove();

    const base = 'http://questions.chgk.info';
    $('img[src]').each((_, el) => {
      const src = $(el).attr('src') ?? '';
      const fullUrl = src.startsWith('http') ? src : `${base}${src}`;
      $(el).replaceWith(`\n\n[IMG:${fullUrl}]\n\n`);
    });

    return $('body').text();
  }

  private stripTags(text: string): string {
    return text.replace(/<[^>]*>/g, '');
  }

  private unwrap(text: string): string {
    return text
      .trim()
      .split('\n\n')
      .map((para) => {
        if (para.trim().startsWith('[IMG:')) return para.trim();
        return para.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      })
      .filter(Boolean)
      .join('\n\n');
  }

  private processImageLinks(text: string): string {
    return text.replace(/\[IMG:(https?:\/\/[^\]]+)\]/g, '<a href="$1">🖼</a>');
  }

  private parseQuestion(html: string): ParsedChGKQuestion | null {
    const extracted = this.stripTags(this.extractText(html));
    const copyrightIndex = extracted.indexOf('©');
    const trimmed = copyrightIndex !== -1 ? extracted.slice(0, copyrightIndex) : extracted;
    const text = trimmed.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const match = text.match(/Вопрос\s+\d+:\s*([\s\S]+)/);
    if (!match || match.index === undefined) {
      this.logger.warn(`Could not find question header. Raw text preview: ${text.slice(0, 200)}`);
      return null;
    }

    // Collect images from razdatka (before the question header)
    const beforeHeader = text.slice(0, match.index);
    const razdatkaImages = [...beforeHeader.matchAll(/\[IMG:(https?:\/\/[^\]]+)\]/g)]
      .map((m) => `[IMG:${m[1]}]`);

    const body = match[1].trim();
    const answerIndex = body.search(/\nОтвет:/);
    if (answerIndex === -1) {
      return { question: body, answer: '' };
    }

    const questionBody = body.slice(0, answerIndex);
    const questionWithImages = razdatkaImages.length
      ? razdatkaImages.join('\n') + '\n\n' + questionBody
      : questionBody;

    const question = this.processImageLinks(this.unwrap(questionWithImages));
    const answer = this.processImageLinks(
      body.slice(answerIndex).replace(/^\s*Ответ:\s*/i, '').trim(),
    );
    return { question, answer };
  }
}
