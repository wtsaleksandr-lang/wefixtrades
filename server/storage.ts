import { db } from "./db";
import { calculators, leads, type Calculator, type InsertCalculator, type Lead, type InsertLead } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";

export interface IStorage {
  createCalculator(data: InsertCalculator): Promise<Calculator>;
  getCalculatorBySlug(slug: string): Promise<Calculator | undefined>;
  getCalculatorByToken(token: string): Promise<Calculator | undefined>;
  updateCalculator(id: number, updates: Partial<InsertCalculator>): Promise<Calculator | undefined>;
  duplicateCalculator(id: number, newSlug: string, newToken: string, newExpiry: Date): Promise<Calculator | undefined>;
  incrementViews(id: number): Promise<void>;
  createLead(data: InsertLead): Promise<Lead>;
  getLeadsByCalculatorId(calculatorId: number): Promise<Lead[]>;
}

export class DatabaseStorage implements IStorage {
  async createCalculator(data: InsertCalculator): Promise<Calculator> {
    const [calc] = await db.insert(calculators).values(data).returning();
    return calc;
  }

  async getCalculatorBySlug(slug: string): Promise<Calculator | undefined> {
    const [calc] = await db.select().from(calculators).where(eq(calculators.slug, slug)).limit(1);
    return calc;
  }

  async getCalculatorByToken(token: string): Promise<Calculator | undefined> {
    const [calc] = await db.select().from(calculators).where(eq(calculators.edit_token, token)).limit(1);
    return calc;
  }

  async updateCalculator(id: number, updates: Partial<InsertCalculator>): Promise<Calculator | undefined> {
    const [calc] = await db.update(calculators).set(updates).where(eq(calculators.id, id)).returning();
    return calc;
  }

  async duplicateCalculator(id: number, newSlug: string, newToken: string, newExpiry: Date): Promise<Calculator | undefined> {
    const original = await this.getCalculatorById(id);
    if (!original) return undefined;

    await db.update(calculators).set({ is_duplicated: true }).where(eq(calculators.id, id));

    const [newCalc] = await db.insert(calculators).values({
      slug: newSlug,
      business_name: original.business_name,
      trade_type: original.trade_type,
      tagline: original.tagline,
      logo_url: original.logo_url,
      owner_email: original.owner_email,
      owner_phone: original.owner_phone,
      website_url: original.website_url,
      primary_color: original.primary_color,
      cta_button_text: original.cta_button_text,
      lead_thank_you_message: original.lead_thank_you_message,
      pricing_config: original.pricing_config,
      theme_overrides: original.theme_overrides,
      calculator_settings: original.calculator_settings,
      edit_token: newToken,
      token_expires_at: newExpiry,
      is_duplicated: false,
      total_views: 0,
      show_powered_by_badge: original.show_powered_by_badge,
    }).returning();
    return newCalc;
  }

  async incrementViews(id: number): Promise<void> {
    await db.update(calculators).set({ total_views: sql`${calculators.total_views} + 1` }).where(eq(calculators.id, id));
  }

  async createLead(data: InsertLead): Promise<Lead> {
    const [lead] = await db.insert(leads).values(data).returning();
    return lead;
  }

  async getLeadsByCalculatorId(calculatorId: number): Promise<Lead[]> {
    return db.select().from(leads).where(eq(leads.calculator_id, calculatorId)).orderBy(desc(leads.created_date));
  }

  private async getCalculatorById(id: number): Promise<Calculator | undefined> {
    const [calc] = await db.select().from(calculators).where(eq(calculators.id, id)).limit(1);
    return calc;
  }
}

export const storage = new DatabaseStorage();
