import { plan } from "@/tests/factories";
import { planFixesAfterCombine } from "./merge";

describe("planFixesAfterCombine", () => {
  it("keeps the saved copy's primary and survival plans; retires the phone's twins", () => {
    const phonePrimary = plan({ kind: "primary" });
    const phoneBad = plan({ kind: "survival", survival_level: 2 });
    const phoneTravel = plan({ kind: "custom", name: "Travelling" });
    const serverPrimary = plan({ kind: "primary" });
    const serverBad = plan({ kind: "survival", survival_level: 2 });
    const serverZero = plan({ kind: "survival", survival_level: 3 });
    const local = new Set([phonePrimary.id, phoneBad.id, phoneTravel.id]);
    const fixes = planFixesAfterCombine(
      [phonePrimary, phoneBad, phoneTravel, serverPrimary, serverBad, serverZero],
      local,
    );
    expect(fixes).toEqual([
      { drop: phonePrimary.id, keep: serverPrimary.id },
      { drop: phoneBad.id, keep: serverBad.id },
    ]);
  });

  it("changes nothing when only one copy has the plan, or rows are gone", () => {
    const phonePrimary = plan({ kind: "primary" });
    const serverZero = plan({ kind: "survival", survival_level: 3 });
    const deletedServerPrimary = plan({ kind: "primary", deleted_at: "x" });
    expect(
      planFixesAfterCombine(
        [phonePrimary, serverZero, deletedServerPrimary],
        new Set([phonePrimary.id]),
      ),
    ).toEqual([]);
  });
});
