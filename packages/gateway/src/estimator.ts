import type { Capability, CostEstimate } from '@studio-os/contracts';
import type { PricingRule } from './router.js';

export type EstimateParams = Record<string, unknown> & {
  prompt?: string;
  duration?: number;
  durationSec?: number;
  width?: number;
  height?: number;
  characters?: number;
};

function num(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return fallback;
}

function estimateTokens(prompt: string): { input: number; output: number } {
  const input = Math.max(1, Math.ceil(prompt.length / 4));
  const output = Math.max(16, Math.ceil(input * 0.75));
  return { input, output };
}

function findProviderId(modelId: string, pricingRules: PricingRule[]): string {
  const hit = pricingRules.find((r) => r.modelId === modelId);
  return hit?.providerId ?? 'unknown';
}

function rateFor(
  pricingRules: PricingRule[],
  modelId: string,
  unit: string,
  fallback: number,
): number {
  const hit = pricingRules.find((r) => r.modelId === modelId && r.unit === unit);
  return hit?.rateUsd ?? fallback;
}

/**
 * Estimate generation cost for mock and rule-driven pricing.
 * Defaults: image $0.02, video $0.05/sec, llm tokens from prompt length, etc.
 */
export function estimateCost(
  modelId: string,
  capability: Capability | string,
  params: EstimateParams,
  pricingRules: PricingRule[],
): CostEstimate {
  const providerId = findProviderId(modelId, pricingRules);
  const prompt = typeof params.prompt === 'string' ? params.prompt : '';
  const breakdown: CostEstimate['breakdown'] = [];
  let minUsd = 0;
  let maxUsd = 0;
  let etaMin = 1;
  let etaMax = 5;

  const cap = capability;

  if (cap === 'image.generate' || cap === 'image.edit' || cap === 'image.upscale') {
    const rate = rateFor(pricingRules, modelId, 'image', 0.02);
    const quantity = 1;
    const amount = rate * quantity;
    breakdown.push({ unit: 'image', quantity, rate, amountUsd: amount });
    minUsd = amount;
    maxUsd = amount * 1.25;
    etaMin = 2;
    etaMax = 12;
  } else if (cap === 'video.generate' || cap === 'video.edit' || cap === 'video.upscale') {
    const duration = Math.max(
      0.1,
      num(params.duration, num(params.durationSec, 4)),
    );
    const rate = rateFor(pricingRules, modelId, 'second', 0.05);
    const amount = rate * duration;
    breakdown.push({ unit: 'second', quantity: duration, rate, amountUsd: amount });
    minUsd = amount;
    maxUsd = amount * 1.4;
    etaMin = Math.ceil(duration);
    etaMax = Math.ceil(duration * 3) + 5;
  } else if (cap === 'text.generate') {
    const { input, output } = estimateTokens(prompt);
    const inRate = rateFor(pricingRules, modelId, 'input_token', 0.000001);
    const outRate = rateFor(pricingRules, modelId, 'output_token', 0.000003);
    const inAmount = input * inRate;
    const outAmount = output * outRate;
    breakdown.push(
      { unit: 'input_token', quantity: input, rate: inRate, amountUsd: inAmount },
      { unit: 'output_token', quantity: output, rate: outRate, amountUsd: outAmount },
    );
    minUsd = inAmount + outAmount * 0.5;
    maxUsd = inAmount + outAmount * 1.5;
    etaMin = 1;
    etaMax = 8;
  } else if (cap === 'text.embed') {
    const { input } = estimateTokens(prompt);
    const rate = rateFor(pricingRules, modelId, 'input_token', 0.0000001);
    const amount = input * rate;
    breakdown.push({ unit: 'input_token', quantity: input, rate, amountUsd: amount });
    minUsd = amount;
    maxUsd = amount * 1.1;
    etaMin = 1;
    etaMax = 3;
  } else if (cap === 'voice.tts' || cap === 'voice.clone') {
    const characters = Math.max(
      1,
      num(params.characters, prompt.length || 1),
    );
    const rate = rateFor(pricingRules, modelId, 'character', 0.00002);
    const amount = characters * rate;
    breakdown.push({ unit: 'character', quantity: characters, rate, amountUsd: amount });
    minUsd = amount;
    maxUsd = amount * 1.2;
    etaMin = 1;
    etaMax = 6;
  } else if (cap === 'voice.stt') {
    const seconds = Math.max(1, num(params.duration, num(params.durationSec, 30)));
    const rate = rateFor(pricingRules, modelId, 'audio_minute', 0.006) / 60;
    const amount = seconds * rate;
    breakdown.push({ unit: 'second', quantity: seconds, rate, amountUsd: amount });
    minUsd = amount;
    maxUsd = amount * 1.3;
    etaMin = 2;
    etaMax = 20;
  } else if (cap === 'music.generate' || cap === 'sfx.generate') {
    const seconds = Math.max(1, num(params.duration, num(params.durationSec, 30)));
    const rate = rateFor(pricingRules, modelId, 'second', 0.01);
    const amount = seconds * rate;
    breakdown.push({ unit: 'second', quantity: seconds, rate, amountUsd: amount });
    minUsd = amount;
    maxUsd = amount * 1.35;
    etaMin = Math.ceil(seconds / 4);
    etaMax = Math.ceil(seconds) + 10;
  } else if (cap === 'lip.sync') {
    const seconds = Math.max(1, num(params.duration, num(params.durationSec, 8)));
    const rate = rateFor(pricingRules, modelId, 'second', 0.03);
    const amount = rate * seconds;
    breakdown.push({ unit: 'second', quantity: seconds, rate, amountUsd: amount });
    minUsd = amount;
    maxUsd = amount * 1.4;
    etaMin = Math.ceil(seconds);
    etaMax = Math.ceil(seconds * 2) + 5;
  } else if (cap === 'audio.stem_split') {
    const seconds = Math.max(1, num(params.duration, num(params.durationSec, 60)));
    const rate = rateFor(pricingRules, modelId, 'audio_minute', 0.04) / 60;
    const amount = seconds * rate;
    breakdown.push({ unit: 'second', quantity: seconds, rate, amountUsd: amount });
    minUsd = amount;
    maxUsd = amount * 1.5;
    etaMin = Math.ceil(seconds / 2);
    etaMax = Math.ceil(seconds) + 20;
  } else if (cap === 'video.color_grade') {
    const seconds = Math.max(0.1, num(params.duration, num(params.durationSec, 4)));
    const rate = rateFor(pricingRules, modelId, 'second', 0.02);
    const amount = rate * seconds;
    breakdown.push({ unit: 'second', quantity: seconds, rate, amountUsd: amount });
    minUsd = amount;
    maxUsd = amount * 1.3;
    etaMin = Math.ceil(seconds / 2) || 1;
    etaMax = Math.ceil(seconds) + 8;
  } else if (cap === 'video.matte') {
    const rate = rateFor(pricingRules, modelId, 'generation', 0.05);
    const frames = Math.max(1, num(params.frames, num(params.duration, 1)));
    const amount = rate * Math.min(frames, 24);
    breakdown.push({ unit: 'generation', quantity: Math.min(frames, 24), rate, amountUsd: amount });
    minUsd = amount;
    maxUsd = amount * 1.4;
    etaMin = 2;
    etaMax = 15;
  } else if (cap === 'music.midi') {
    const seconds = Math.max(1, num(params.duration, num(params.durationSec, 16)));
    const rate = rateFor(pricingRules, modelId, 'second', 0.005);
    const amount = rate * seconds;
    breakdown.push({ unit: 'second', quantity: seconds, rate, amountUsd: amount });
    minUsd = amount;
    maxUsd = amount * 1.25;
    etaMin = 1;
    etaMax = Math.ceil(seconds / 4) + 5;
  } else {
    const rate = rateFor(pricingRules, modelId, 'generation', 0.01);
    breakdown.push({ unit: 'generation', quantity: 1, rate, amountUsd: rate });
    minUsd = rate;
    maxUsd = rate * 2;
  }

  return {
    minUsd: Number(minUsd.toFixed(6)),
    maxUsd: Number(maxUsd.toFixed(6)),
    currency: 'USD',
    breakdown,
    modelId,
    providerId,
    etaSec: { min: etaMin, max: etaMax },
  };
}
