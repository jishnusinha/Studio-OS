import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { characters, type Database } from '@studio-os/db';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DB } from '../db/db.tokens.js';

const CharacterCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  traits: z.array(z.string()).optional(),
  referenceImageIds: z.array(z.string().uuid()).optional(),
  wardrobeVariants: z.array(z.record(z.unknown())).optional(),
  voiceProfile: z.record(z.unknown()).optional(),
  actingNotes: z.string().optional(),
  rightsConsent: z.boolean().optional(),
  body: z.record(z.unknown()).optional(),
  status: z.string().optional(),
  locked: z.boolean().optional(),
});

const CharacterUpdateSchema = CharacterCreateSchema.partial();

function mapCharacterRow(row: typeof characters.$inferSelect) {
  const identity = (row.identity ?? {}) as Record<string, unknown>;
  const wardrobe = (row.wardrobe ?? {}) as Record<string, unknown>;
  const acting = (row.acting ?? {}) as Record<string, unknown>;
  const rights = (row.rights ?? {}) as Record<string, unknown>;
  return {
    ...row,
    description: row.bio,
    traits: (identity.traits as string[] | undefined) ?? [],
    referenceImageIds: (identity.referenceImageIds as string[] | undefined) ?? [],
    wardrobeVariants: (wardrobe.variants as unknown[] | undefined) ?? [],
    actingNotes: (acting.notes as string | undefined) ?? null,
    rightsConsent: Boolean(rights.consent),
  };
}

@Injectable()
export class CharactersService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(projectId: string) {
    const rows = await this.db
      .select()
      .from(characters)
      .where(eq(characters.projectId, projectId));
    return rows.map(mapCharacterRow);
  }

  async get(id: string) {
    const [row] = await this.db.select().from(characters).where(eq(characters.id, id)).limit(1);
    if (!row) throw new NotFoundException('Character not found');
    return mapCharacterRow(row);
  }

  async create(projectId: string, body: unknown) {
    const parsed = CharacterCreateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const data = parsed.data;

    const [row] = await this.db
      .insert(characters)
      .values({
        projectId,
        name: data.name,
        bio: data.description ?? null,
        identity: {
          traits: data.traits ?? [],
          referenceImageIds: data.referenceImageIds ?? [],
        },
        body: data.body ?? {},
        wardrobe: { variants: data.wardrobeVariants ?? [] },
        voiceProfile: data.voiceProfile ?? {},
        acting: { notes: data.actingNotes ?? '' },
        rights: { consent: data.rightsConsent ?? false },
        status: data.status ?? 'draft',
        locked: data.locked ?? false,
      })
      .returning();

    if (!row) throw new BadRequestException('Failed to create character');
    return mapCharacterRow(row);
  }

  async update(id: string, body: unknown) {
    const parsed = CharacterUpdateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const data = parsed.data;

    const [existing] = await this.db
      .select()
      .from(characters)
      .where(eq(characters.id, id))
      .limit(1);
    if (!existing) throw new NotFoundException('Character not found');

    const identity = {
      ...(existing.identity as Record<string, unknown>),
      ...(data.traits !== undefined ? { traits: data.traits } : {}),
      ...(data.referenceImageIds !== undefined
        ? { referenceImageIds: data.referenceImageIds }
        : {}),
    };
    const wardrobe = {
      ...(existing.wardrobe as Record<string, unknown>),
      ...(data.wardrobeVariants !== undefined ? { variants: data.wardrobeVariants } : {}),
    };
    const acting = {
      ...(existing.acting as Record<string, unknown>),
      ...(data.actingNotes !== undefined ? { notes: data.actingNotes } : {}),
    };
    const rights = {
      ...(existing.rights as Record<string, unknown>),
      ...(data.rightsConsent !== undefined ? { consent: data.rightsConsent } : {}),
    };

    // Voice / likeness generation requires explicit consent
    const existingRights = (existing.rights ?? {}) as Record<string, unknown>;
    const consentGranted =
      data.rightsConsent === true ||
      rights.consent === true ||
      existingRights.consent === true;
    if (data.voiceProfile && Object.keys(data.voiceProfile).length > 0 && !consentGranted) {
      throw new BadRequestException(
        'rightsConsent must be true before setting voiceProfile for voice/likeness generation',
      );
    }

    const [updated] = await this.db
      .update(characters)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { bio: data.description } : {}),
        identity,
        wardrobe,
        acting,
        rights,
        ...(data.voiceProfile !== undefined ? { voiceProfile: data.voiceProfile } : {}),
        ...(data.body !== undefined ? { body: data.body } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.locked !== undefined ? { locked: data.locked } : {}),
        updatedAt: new Date(),
        version: existing.version + 1,
      })
      .where(eq(characters.id, id))
      .returning();

    return mapCharacterRow(updated!);
  }

  async remove(id: string) {
    const [deleted] = await this.db
      .delete(characters)
      .where(eq(characters.id, id))
      .returning();
    if (!deleted) throw new NotFoundException('Character not found');
    return { ok: true, id };
  }

  async assertProject(id: string, projectId: string) {
    const [row] = await this.db
      .select({ id: characters.id })
      .from(characters)
      .where(and(eq(characters.id, id), eq(characters.projectId, projectId)))
      .limit(1);
    if (!row) throw new NotFoundException('Character not found');
  }
}
