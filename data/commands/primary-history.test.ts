import { bootstrapDatabase } from "@/data/bootstrap";
import { testContext } from "@/tests/db";
import { makePrimary } from "./plans";
import { currentDayKey, readSettings } from "./shared";

const ONE_DAY = 86_400_000;

describe("makePrimary remembers the plan it replaced", () => {
  let t: ReturnType<typeof testContext>;
  beforeEach(async () => {
    t = testContext();
    expect((await bootstrapDatabase({ seedDemo: true, ctx: t.ctx })).ok).toBe(true);
  });
  afterEach(async () => {
    await t.close();
  });

  async function planId(name: string): Promise<string> {
    const plan = (await t.db.day_plans.toArray()).find((p) => p.name === name && !p.deleted_at);
    if (!plan) throw new Error(`no plan ${name}`);
    return plan.id;
  }

  it("records the old primary against the day of the change", async () => {
    const normal = await planId("Normal");
    const dayKey = await currentDayKey(t.ctx);
    await t.db.user_settings.update("me", { _dirty: 0 });

    await makePrimary(t.ctx, { planId: await planId("Travelling") });

    expect((await readSettings(t.ctx)).primaryHistory).toEqual([{ planId: normal, until: dayKey }]);
    expect((await t.db.user_settings.get("me"))?._dirty).toBe(1);
  });

  it("adds one entry per day, however many changes that day has", async () => {
    const normal = await planId("Normal");
    const travelling = await planId("Travelling");
    const firstDay = await currentDayKey(t.ctx);

    await makePrimary(t.ctx, { planId: travelling });
    await makePrimary(t.ctx, { planId: normal });
    await makePrimary(t.ctx, { planId: travelling });
    t.advance(ONE_DAY);
    const nextDay = await currentDayKey(t.ctx);
    await makePrimary(t.ctx, { planId: normal });

    expect((await readSettings(t.ctx)).primaryHistory).toEqual([
      { planId: normal, until: firstDay },
      { planId: travelling, until: nextDay },
    ]);
  });

  it("records nothing when the plan is already primary or the change is refused", async () => {
    await makePrimary(t.ctx, { planId: await planId("Normal") });
    await makePrimary(t.ctx, { planId: await planId("Bad day") });
    expect((await readSettings(t.ctx)).primaryHistory).toEqual([]);
  });
});
