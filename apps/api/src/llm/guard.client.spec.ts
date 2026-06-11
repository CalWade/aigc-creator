import { mapGuardLabelsToSensitive, mapGuardLevelToSeverity } from "./guard.client";

describe("GuardClient", () => {
  describe("mapGuardLabelsToSensitive", () => {
    it("maps sexual labels to pornography", () => {
      expect(mapGuardLabelsToSensitive(["pornographic_adult", "sexual_terms"])).toEqual([
        "pornography",
      ]);
    });

    it("maps gambling label", () => {
      expect(mapGuardLabelsToSensitive(["contraband_gambling"])).toEqual(["gambling"]);
    });

    it("maps drug label", () => {
      expect(mapGuardLabelsToSensitive(["contraband_drug"])).toEqual(["drugs"]);
    });

    it("maps political labels to abuse", () => {
      expect(mapGuardLabelsToSensitive(["political_entity", "political_figure"])).toEqual([
        "abuse",
      ]);
    });

    it("maps violent labels to abuse", () => {
      expect(mapGuardLabelsToSensitive(["violent_weapons", "violent_extremists"])).toEqual([
        "abuse",
      ]);
    });

    it("maps ad labels to illicit_ads", () => {
      expect(mapGuardLabelsToSensitive(["pt_to_sites", "pt_by_recruitment"])).toEqual([
        "illicit_ads",
      ]);
    });

    it("maps contraband_act/entity to fraud", () => {
      expect(mapGuardLabelsToSensitive(["contraband_act", "contraband_entity"])).toEqual(["fraud"]);
    });

    it("deduplicates categories", () => {
      expect(mapGuardLabelsToSensitive(["pornographic_adult", "sexual_suggestive"])).toEqual([
        "pornography",
      ]);
    });

    it("ignores unknown / nonLabel / privacy labels", () => {
      expect(mapGuardLabelsToSensitive(["nonLabel", "privacy_p", "unknown_label"])).toEqual([]);
    });

    it("returns empty for empty input", () => {
      expect(mapGuardLabelsToSensitive([])).toEqual([]);
    });
  });

  describe("mapGuardLevelToSeverity", () => {
    it("maps high → high", () => expect(mapGuardLevelToSeverity("high")).toBe("high"));
    it("maps medium → medium", () => expect(mapGuardLevelToSeverity("medium")).toBe("medium"));
    it("maps low → low", () => expect(mapGuardLevelToSeverity("low")).toBe("low"));
    it("maps none → low", () => expect(mapGuardLevelToSeverity("none")).toBe("low"));
  });
});
